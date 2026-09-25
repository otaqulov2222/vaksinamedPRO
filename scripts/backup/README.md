# Database backup / restore (ops)

## Status

- **Logical restore drill (PGlite / migrations):** available via `pnpm backup:drill`
- **Managed PostgreSQL automated backups / PITR:** **OPS_REQUIRED** (Phase 12.29 — no managed provider / `DATABASE_URL` in workspace)
- This folder does **not** claim production backups exist until a provider drill is recorded

## Commands

```bash
# Non-production migration restore drill (CI-safe)
pnpm backup:drill
# (runs lib/db/src/scripts/restore-drill.ts)
```

## Suggested production ops (MANUAL)

```bash
pg_dump "$DATABASE_URL" --format=custom --file="backup-UTC.dump"
# Restore ONLY into an empty isolated database
pg_restore --clean --if-exists --dbname="$RESTORE_DATABASE_URL" backup-UTC.dump
```

## Safety

- Never restore against production without an explicit incident command
- Never delete financial history
- Prefer provider PITR when available
