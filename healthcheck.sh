#!/usr/bin/env bash
# AL-TAHS production one-command health check
#
# Usage:
#   ./healthcheck.sh
#
# Optional overrides:
#   APP_SERVICE=altasystem-altasystemproduction-bsbnvt DB_SERVICE=altasystem-altasystemdatabase-ueuueg ./healthcheck.sh

set -uo pipefail

APP_SERVICE="${APP_SERVICE:-altasystem-altasystemproduction-bsbnvt}"
DB_SERVICE="${DB_SERVICE:-altasystem-altasystemdatabase-ueuueg}"
TRAEFIK_SERVICE="${TRAEFIK_SERVICE:-dokploy-traefik}"
UMAMI_SERVICE="${UMAMI_SERVICE:-altasystem-umami-qde5er-umami}"
UMAMI_DB_SERVICE="${UMAMI_DB_SERVICE:-altasystem-umami-qde5er-db}"

APP_DOMAIN="${APP_DOMAIN:-altasystem.online}"
WWW_DOMAIN="${WWW_DOMAIN:-www.altasystem.online}"
ANALYTICS_DOMAIN="${ANALYTICS_DOMAIN:-analytics.altasystem.online}"

ERROR_LOG_DIR="${ERROR_LOG_DIR:-/app/backend/logs/errors}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/altas}"
HTTP_TIMEOUT="${HTTP_TIMEOUT:-12}"

PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

color() {
  local code="$1"; shift
  if [ -t 1 ]; then
    printf "\033[%sm%s\033[0m\n" "$code" "$*"
  else
    printf "%s\n" "$*"
  fi
}

pass() { PASS_COUNT=$((PASS_COUNT + 1)); color "32" "[PASS] $*"; }
fail() { FAIL_COUNT=$((FAIL_COUNT + 1)); color "31" "[FAIL] $*"; }
warn() { WARN_COUNT=$((WARN_COUNT + 1)); color "33" "[WARN] $*"; }
info() { color "36" "[INFO] $*"; }

service_replicas() {
  local service="$1"
  docker service ls --format '{{.Name}} {{.Replicas}}' 2>/dev/null | awk -v s="$service" '$1==s {print $2}'
}

check_service() {
  local service="$1"
  local replicas
  replicas="$(service_replicas "$service")"

  if [ -z "$replicas" ]; then
    fail "Docker service missing: $service"
    return
  fi

  local running desired
  running="${replicas%%/*}"
  desired="${replicas##*/}"
  if [ "$desired" -gt 0 ] 2>/dev/null && [ "$running" -eq "$desired" ] 2>/dev/null; then
    pass "Service healthy: $service ($replicas)"
  else
    fail "Service unhealthy: $service ($replicas)"
  fi
}

check_http() {
  local url="$1"
  local code
  code="$(curl -k -sS -o /dev/null -w '%{http_code}' --max-time "$HTTP_TIMEOUT" "$url" 2>/dev/null || true)"
  if [ "$code" = "200" ] || [ "$code" = "301" ] || [ "$code" = "302" ]; then
    pass "HTTP check ok: $url (status $code)"
  else
    fail "HTTP check failed: $url (status ${code:-N/A})"
  fi
}

check_tls() {
  local host="$1"
  if echo | openssl s_client -servername "$host" -connect "$host:443" 2>/dev/null | grep -q "Verify return code: 0 (ok)"; then
    pass "TLS certificate valid: $host"
  else
    fail "TLS certificate invalid/untrusted: $host"
  fi
}

check_app_db_from_container() {
  local cid
  cid="$(docker ps --format '{{.ID}} {{.Names}}' | awk -v s="$APP_SERVICE" '$2 ~ "^" s {print $1; exit}')"

  if [ -z "$cid" ]; then
    fail "No running app container found for service prefix: $APP_SERVICE"
    return
  fi

  if docker exec "$cid" sh -lc "cd /app/backend && node -e \"const prisma=require('./src/prisma');(async()=>{await prisma.\$queryRawUnsafe('SELECT 1');await prisma.\$disconnect();})();\"" >/dev/null 2>&1; then
    pass "App-to-DB query works from container"
  else
    fail "App-to-DB query failed from container"
  fi
}

check_error_logs() {
  local cid
  cid="$(docker ps --format '{{.ID}} {{.Names}}' | awk -v s="$APP_SERVICE" '$2 ~ "^" s {print $1; exit}')"
  if [ -z "$cid" ]; then
    warn "Skipped error-log check (app container not found)"
    return
  fi

  local count
  count="$(docker exec "$cid" sh -lc "if [ -d '$ERROR_LOG_DIR' ]; then find '$ERROR_LOG_DIR' -type f -mtime -1 | wc -l; else echo 0; fi" 2>/dev/null | tr -d '[:space:]')"
  if [ -z "$count" ]; then
    warn "Could not inspect error logs at $ERROR_LOG_DIR"
  elif [ "$count" -eq 0 ] 2>/dev/null; then
    pass "No new error log files in last 24h"
  else
    warn "Found $count error log file(s) in last 24h under $ERROR_LOG_DIR"
  fi
}

check_backup_freshness() {
  if [ ! -d "$BACKUP_DIR" ]; then
    warn "Backup dir not found: $BACKUP_DIR"
    return
  fi

  if find "$BACKUP_DIR" -type f \( -name "*.sql" -o -name "*.dump" -o -name "*.gz" -o -name "*.backup" \) -mtime -2 | grep -q .; then
    pass "Recent backup exists in $BACKUP_DIR (<= 48h)"
  else
    warn "No recent backup file found in $BACKUP_DIR (<= 48h)"
  fi
}

check_disk_usage() {
  local used
  used="$(df --output=pcent / | tail -1 | tr -dc '0-9')"
  if [ -z "$used" ]; then
    warn "Could not read disk usage"
    return
  fi

  if [ "$used" -ge 90 ]; then
    fail "Disk usage critical: ${used}%"
  elif [ "$used" -ge 80 ]; then
    warn "Disk usage high: ${used}%"
  else
    pass "Disk usage ok: ${used}%"
  fi
}

main() {
  info "AL-TAHS health check started"
  info "Services: app=$APP_SERVICE db=$DB_SERVICE traefik=$TRAEFIK_SERVICE umami=$UMAMI_SERVICE umami-db=$UMAMI_DB_SERVICE"

  if ! command -v docker >/dev/null 2>&1; then
    fail "docker command not found"
    exit 2
  fi

  if ! command -v curl >/dev/null 2>&1; then
    fail "curl command not found"
    exit 2
  fi

  if ! command -v openssl >/dev/null 2>&1; then
    fail "openssl command not found"
    exit 2
  fi

  if ! docker info >/dev/null 2>&1; then
    fail "Docker daemon not reachable"
    exit 2
  fi

  check_service "$APP_SERVICE"
  check_service "$DB_SERVICE"
  check_service "$TRAEFIK_SERVICE"
  check_service "$UMAMI_SERVICE"
  check_service "$UMAMI_DB_SERVICE"

  check_http "https://$APP_DOMAIN"
  check_http "https://$WWW_DOMAIN"
  check_http "https://$ANALYTICS_DOMAIN"

  check_tls "$APP_DOMAIN"
  check_tls "$WWW_DOMAIN"
  check_tls "$ANALYTICS_DOMAIN"

  check_app_db_from_container
  check_error_logs
  check_backup_freshness
  check_disk_usage

  echo
  info "Summary: PASS=$PASS_COUNT WARN=$WARN_COUNT FAIL=$FAIL_COUNT"

  if [ "$FAIL_COUNT" -gt 0 ]; then
    exit 1
  fi
  exit 0
}

main "$@"

