# P4.1 — Inventory database foundation

**Status:** IMPLEMENTED (schema/migration only)  
**Does not change:** checkout, POS, FOM, payments, delivery, Expo UI, AuthN

## Compatibility: legacy `quantity`

| Item | Behavior |
|------|----------|
| Backfill | `physical_quantity = quantity`, `reserved_quantity = 0` |
| Writers (orders/admin/seed) | Still write `quantity` only — **unchanged in P4.1** |
| Bridge | BEFORE INSERT/UPDATE trigger mirrors `quantity` ↔ `physical_quantity` |
| `available_quantity` | STORED GENERATED `(physical − reserved)` — not writable |
| Temporary until | **P4.5** checkout switches to reserve/consume on physical/reserved and retires quantity as authority |

`orders.reserved_until` remains legacy/cache. `orders.reservation_id` is nullable FK; no backfill.

**P4.2** adds UNIQUE(branch_id, product_id) after duplicate merge — not in this migration.
