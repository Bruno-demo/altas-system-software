# Docker Runbook (AL-TAHS)

## 1) One-time setup
1. Copy `.env.docker.example` to `.env` in project root.
2. Set strong values for:
   - `POSTGRES_PASSWORD`
   - `JWT_SECRET`
3. Keep `APP_PORT=5000` unless that port is already used.

## 2) Build and start
```powershell
docker compose up -d --build
```

## 3) Check status
```powershell
docker compose ps
docker compose logs app --tail=100
```

App URL:
- `http://localhost:5000`
- Or LAN IP: `http://<your-ip>:5000`

Note:
- PostgreSQL is internal to Docker network (not exposed on host `5432`), so it will not conflict with your local PostgreSQL service.

## 4) Seed demo data (optional)
Set a temporary seed password first (not printed by the seed script):
```powershell
$env:SEED_DEFAULT_PASSWORD = "TemporaryStrongPassword123!"
```

Production safety:
- Seeding is blocked when `NODE_ENV=production`.
- To intentionally seed in production (controlled only), set `ALLOW_PROD_SEED=true`.

Run seed:
```powershell
docker compose exec app npm run seed
```

## 5) Daily operations
- Restart app:
```powershell
docker compose restart app
```
- Stop all:
```powershell
docker compose down
```
- Start all:
```powershell
docker compose up -d
```

## 6) Logs and data
- DB data volume: `altas_pg_data`
- App logs volume: `altas_app_logs`
- Error logs are inside app volume at `/app/backend/logs/errors`

To inspect container logs:
```powershell
docker compose logs app --tail=200
docker compose logs db --tail=200
```

## 7) Backup and restore with Docker DB
Because DB is inside Docker, run pg tools through container:
```powershell
docker compose exec db pg_dump -U postgres -d altas_local -F c -f /tmp/altas.backup
docker compose cp db:/tmp/altas.backup .\altas.backup
```

Restore example:
```powershell
docker compose cp .\altas.backup db:/tmp/altas.backup
docker compose exec db pg_restore -U postgres -d altas_local --clean --if-exists /tmp/altas.backup
```

## 8) Upgrade workflow
```powershell
docker compose down
docker compose up -d --build
```

## 9) Troubleshooting
- If app cannot connect to DB:
  - Confirm `db` is healthy: `docker compose ps`
  - Confirm `POSTGRES_PASSWORD` in root `.env` is correct.
- If port conflict on 5000:
  - Change `APP_PORT` in root `.env`.
