# P4 Inventory — Production Cutover Gates

Deployment gate only. Do **not** treat repository tests as production cutover.

Before enabling reservation lifecycle in a deployed environment:

1. **Backup / restore point** on the target database (Q19).
2. **Duplicate stock inspection** — identify `(branch_id, product_id)` groups with COUNT > 1; confirm merge policy (SUM physical/reserved, survivor MIN id).
3. **Versioned migrations applied** — through `0003_inventory_unique` (and `0004_inventory_adjust_permission` for admin adjust AuthZ).
4. **Open / non-terminal order audit** — environment-specific assessment before switching writers.
5. **Feature / single-path verification** — new checkout reserves; legacy create-time physical decrement disabled for that path.
6. **FOM inventory writers remain OFF** — FOM bridge must not mutate `product_stocks` (loyalty/order confirm only).
7. **Tests green** — DB + inventory + API security + integration regression + typecheck + build.
8. **P4.10 post-implementation audit** completed before calling P4 production-ready.

This batch (P4.6–P4.9) implements expiry service, admin adjust, concurrency matrix, and regression tests. It does **not** perform production cutover.
