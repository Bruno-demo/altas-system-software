param(
  [string]$ProjectRoot = $PSScriptRoot,
  [string]$PostgresPassword,
  [string]$JwtSecret,
  [int]$AppPort = 5000,
  [int]$ErrorLogRetentionDays = 30,
  [string]$BackupFile,
  [switch]$Seed,
  [switch]$SkipFirewall,
  [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Ensure-Command {
  param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' was not found in PATH."
  }
}

function New-RandomSecret {
  param([int]$Length = 48)
  $bytes = New-Object byte[] $Length
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return [Convert]::ToBase64String($bytes)
}

function Is-Admin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Wait-AppReady {
  param(
    [string]$Url,
    [int]$MaxSeconds = 120
  )

  $deadline = (Get-Date).AddSeconds($MaxSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $res = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
      if ($res.StatusCode -ge 200 -and $res.StatusCode -lt 500) {
        return $true
      }
    } catch {
      Start-Sleep -Seconds 2
    }
  }
  return $false
}

function Get-LanIps {
  $all = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object {
      $_.IPAddress -notmatch "^(127|169\.254)\." -and
      $_.InterfaceAlias -notmatch "Loopback|vEthernet|Docker|Virtual|Hyper-V|WireGuard|VPN"
    } |
    Select-Object -ExpandProperty IPAddress -Unique

  if (-not $all) {
    $all = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
      Where-Object { $_.IPAddress -notmatch "^(127|169\.254)\." } |
      Select-Object -ExpandProperty IPAddress -Unique
  }

  return @($all)
}

function Invoke-Compose {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Args
  )

  & docker compose @Args
  if ($LASTEXITCODE -ne 0) {
    throw "docker compose $($Args -join ' ') failed with exit code $LASTEXITCODE"
  }
}

Ensure-Command "docker"

Write-Step "Validating Docker engine"
& docker info *> $null
if ($LASTEXITCODE -ne 0) {
  throw "Docker is not running. Start Docker Desktop and retry."
}

if (-not (Test-Path (Join-Path $ProjectRoot "docker-compose.yml"))) {
  throw "docker-compose.yml not found in '$ProjectRoot'."
}

if (-not $PostgresPassword) {
  $PostgresPassword = Read-Host "Enter POSTGRES_PASSWORD for this server (.env)"
}
if (-not $PostgresPassword) {
  throw "POSTGRES_PASSWORD cannot be empty."
}
if (($PostgresPassword -match "\$") -and (-not $Force)) {
  throw "POSTGRES_PASSWORD contains '$'. Use -Force to allow, or choose a password without '$'."
}

if (-not $JwtSecret) {
  $JwtSecret = New-RandomSecret -Length 48
}

if ($BackupFile -and $Seed) {
  throw "Choose either -BackupFile or -Seed, not both."
}

if ($BackupFile -and -not (Test-Path $BackupFile)) {
  throw "Backup file not found: $BackupFile"
}

$envPath = Join-Path $ProjectRoot ".env"
if ((Test-Path $envPath) -and (-not $Force)) {
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $backupEnv = Join-Path $ProjectRoot ".env.backup.$stamp"
  Copy-Item -Path $envPath -Destination $backupEnv -Force
  Write-Host "Existing .env backed up to $backupEnv" -ForegroundColor Yellow
}

Write-Step "Writing .env (Step 4)"
$envLines = @(
  "POSTGRES_PASSWORD=$PostgresPassword"
  "JWT_SECRET=$JwtSecret"
  "APP_PORT=$AppPort"
  "ERROR_LOG_RETENTION_DAYS=$ErrorLogRetentionDays"
)
Set-Content -Path $envPath -Value ($envLines -join [Environment]::NewLine) -Encoding UTF8

Push-Location $ProjectRoot
try {
  Write-Step "Starting containers with build (Step 5)"
  Invoke-Compose -Args @("up", "-d", "--build")

  if ($BackupFile) {
    Write-Step "Restoring database from backup (Step 6)"
    Invoke-Compose -Args @("stop", "app")

    & docker cp $BackupFile "altas-db:/tmp/altas_local.backup"
    if ($LASTEXITCODE -ne 0) {
      throw "docker cp backup -> altas-db failed."
    }

    & docker exec altas-db sh -lc "dropdb -U postgres --if-exists altas_local && createdb -U postgres altas_local && pg_restore -U postgres -d altas_local --clean --if-exists /tmp/altas_local.backup"
    if ($LASTEXITCODE -ne 0) {
      throw "Database restore failed."
    }

    Invoke-Compose -Args @("start", "app")
  } elseif ($Seed) {
    Write-Step "Running seed data (Step 7)"
    Invoke-Compose -Args @("exec", "app", "npm", "run", "seed")
  } else {
    Write-Host "Skipping restore/seed (no -BackupFile and no -Seed)." -ForegroundColor Yellow
  }

  Write-Step "Verifying local health (Step 8)"
  $localUrl = "http://localhost:$AppPort"
  $ready = Wait-AppReady -Url $localUrl -MaxSeconds 150
  if (-not $ready) {
    throw "App did not become ready at $localUrl"
  }
  Write-Host "Local check passed: $localUrl" -ForegroundColor Green

  Write-Step "Configuring firewall + LAN access info (Step 9)"
  $ruleName = "AL-TAHS App $AppPort"
  if ($SkipFirewall) {
    Write-Host "Skipping firewall setup because -SkipFirewall was used." -ForegroundColor Yellow
  } else {
    if (Is-Admin) {
      $existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
      if (-not $existing) {
        New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort $AppPort -Action Allow | Out-Null
        Write-Host "Firewall rule created: $ruleName" -ForegroundColor Green
      } else {
        Write-Host "Firewall rule already exists: $ruleName" -ForegroundColor Green
      }
    } else {
      Write-Host "Not running as Administrator. Firewall rule was not created." -ForegroundColor Yellow
      Write-Host "Run this once in Admin PowerShell:" -ForegroundColor Yellow
      Write-Host "New-NetFirewallRule -DisplayName `"$ruleName`" -Direction Inbound -Protocol TCP -LocalPort $AppPort -Action Allow"
    }
  }

  $ips = Get-LanIps
  if ($ips.Count -eq 0) {
    Write-Host "Could not detect LAN IPv4 automatically. Use 'ipconfig' to find the server IP." -ForegroundColor Yellow
  } else {
    Write-Host ""
    Write-Host "Users on office LAN can access at:" -ForegroundColor Cyan
    foreach ($ip in $ips) {
      Write-Host "  http://$ip`:$AppPort"
    }
  }

  Write-Host ""
  Write-Host "Deployment completed." -ForegroundColor Green
  Write-Host "Check containers:" -ForegroundColor Gray
  Write-Host "  docker compose ps"
  Write-Host "Check app logs:" -ForegroundColor Gray
  Write-Host "  docker logs -f altas-app"
}
finally {
  Pop-Location
}
