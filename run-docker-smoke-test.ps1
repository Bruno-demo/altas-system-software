param(
    [string]$BaseUrl = "http://127.0.0.1:5000",
    [string]$Password = "Altas@2026"
)

$passed = 0
$failed = 0

function Test-API {
    param([string]$Name, [string]$Uri, [string]$Method = "GET", [object]$Body, [hashtable]$H)
    
    try {
        $args = @{ Uri = "$BaseUrl$Uri"; Method = $Method; ContentType = "application/json"; Headers = $H }
        if ($Body) { $args.Body = ($Body | ConvertTo-Json) }
        $null = Invoke-RestMethod @args
        Write-Host "[PASS] $Name" -ForegroundColor Green
        return $true
    } catch {
        Write-Host "[FAIL] $Name - $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

Write-Host "`n============ ALTAS API Smoke Test ============`n" -ForegroundColor Cyan
Write-Host "Target: $BaseUrl`n" -ForegroundColor Cyan

# LOGIN
$loginBody = @{ email = "ceo@altas.local"; password = $Password }
try {
    $login = Invoke-RestMethod -Uri "$BaseUrl/api/auth/login" -Method POST -ContentType "application/json" -Body ($loginBody | ConvertTo-Json)
    $token = $login.token
    $h = @{ Authorization = "Bearer $token" }
    Write-Host "AUTHENTICATED: $($login.user.fullName) ($($login.user.role))`n" -ForegroundColor Green
} catch {
    Write-Host "LOGIN FAILED: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# ACCOUNTING
Write-Host "== Accounting ==" -ForegroundColor Yellow
if (Test-API "Accounts" "/api/accounting/accounts" -H $h) { $passed++ } else { $failed++ }
if (Test-API "Trial Balance" "/api/accounting/trial-balance?period=this_month" -H $h) { $passed++ } else { $failed++ }

# STOCK
Write-Host "`n== Stock Management ==" -ForegroundColor Yellow
if (Test-API "Locations" "/api/locations" -H $h) { $passed++ } else { $failed++ }
if (Test-API "Products" "/api/products?page=1" -H $h) { $passed++ } else { $failed++ }
if (Test-API "Inventory" "/api/stock/inventory?page=1" -H $h) { $passed++ } else { $failed++ }

# REPORTS
Write-Host "`n== Reports ==" -ForegroundColor Yellow
if (Test-API "Summary" "/api/reports/summary?period=this_month" -H $h) { $passed++ } else { $failed++ }
if (Test-API "Sales by Payment" "/api/reports/sales-by-payment?period=this_month" -H $h) { $passed++ } else { $failed++ }
if (Test-API "Best Sellers" "/api/reports/best-sellers?period=this_month" -H $h) { $passed++ } else { $failed++ }
if (Test-API "Cashflow" "/api/reports/cashflow?period=this_month" -H $h) { $passed++ } else { $failed++ }
if (Test-API "EBM Summary" "/api/reports/ebm/summary?period=this_month" -H $h) { $passed++ } else { $failed++ }
if (Test-API "Profit" "/api/reports/profit?period=this_month" -H $h) { $passed++ } else { $failed++ }

# ADMIN
Write-Host "`n== Admin ==" -ForegroundColor Yellow
if (Test-API "Users" "/api/admin/users?page=1" -H $h) { $passed++ } else { $failed++ }

# HR
Write-Host "`n== HR ==" -ForegroundColor Yellow
if (Test-API "Employees" "/api/hr/employees?page=1" -H $h) { $passed++ } else { $failed++ }
if (Test-API "Attendance" "/api/hr/attendance?date=2026-03-17" -H $h) { $passed++ } else { $failed++ }
if (Test-API "Advances" "/api/hr/advances?page=1" -H $h) { $passed++ } else { $failed++ }
if (Test-API "Payroll" "/api/hr/payroll?page=1" -H $h) { $passed++ } else { $failed++ }

# EXPENSES
Write-Host "`n== Expenses ==" -ForegroundColor Yellow
if (Test-API "Expenses List" "/api/expenses?page=1" -H $h) { $passed++ } else { $failed++ }
if (Test-API "Expense Summary" "/api/expenses/summary?period=this_month" -H $h) { $passed++ } else { $failed++ }

# POS
Write-Host "`n== POS ==" -ForegroundColor Yellow
# Shift Status requires CASHIER role
try {
    $cashierLoginResp = Invoke-RestMethod -Uri "$BaseUrl/api/auth/login" -Method POST -ContentType "application/json" -Body (@{email="cashier@altas.local"; password=$Password} | ConvertTo-Json)
    $cashierToken = $cashierLoginResp.token
    $cashierH = @{ Authorization = "Bearer $cashierToken" }
    if (Test-API "Shift Status (as Cashier)" "/api/pos/shift/open" -H $cashierH) { $passed++ } else { $failed++ }
} catch {
    Write-Host "[FAIL] Shift Status (as Cashier) - $($_.Exception.Message)" -ForegroundColor Red
    $failed++
}
if (Test-API "Sales" "/api/pos/sales?page=1" -H $h) { $passed++ } else { $failed++ }

# AUDIT
Write-Host "`n== Audit ==" -ForegroundColor Yellow
if (Test-API "Audit Logs" "/api/reports/audit?page=1" -H $h) { $passed++ } else { $failed++ }

# MULTI-USER
Write-Host "`n== Multi-User Auth ==" -ForegroundColor Yellow
$users = @(
    @{email="manager@altas.local"; role="MANAGER"}
    @{email="hr@altas.local"; role="HR"}
    @{email="cashier@altas.local"; role="CASHIER"}
)

foreach ($user in $users) {
    try {
        $login2 = Invoke-RestMethod -Uri "$BaseUrl/api/auth/login" -Method POST -ContentType "application/json" -Body (@{email=$user.email; password=$Password} | ConvertTo-Json)
        if ($login2.token) {
            Write-Host "[PASS] Login as $($user.role)" -ForegroundColor Green
            $passed++
        } else {
            Write-Host "[FAIL] Login as $($user.role)" -ForegroundColor Red
            $failed++
        }
    } catch {
        Write-Host "[FAIL] Login as $($user.role)" -ForegroundColor Red
        $failed++
    }
}

# SUMMARY
Write-Host "`n========== Summary ==========" -ForegroundColor Cyan
Write-Host "Passed: $passed" -ForegroundColor Green
Write-Host "Failed: $failed" -ForegroundColor $(if ($failed -gt 0) { "Red" } else { "Green" })

if ($failed -eq 0) {
    Write-Host "`nAll API endpoints working!" -ForegroundColor Green
    exit 0
} else {
    exit 1
}
