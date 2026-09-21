# Vaksina Med — Production readiness

## Concurrent load (1000+ users)
- Local demo: PGlite (single process, NOT for production traffic)
- Production: set `DATABASE_URL` to managed PostgreSQL (Neon/Supabase/Yandex Cloud)
- Run multiple API instances behind a load balancer; use Redis for rate-limit buckets
- CDN for Expo web / static assets; sticky sessions not required (JWT auth)

## Auth (official)
1. Register: phone + name → SMS OTP (Eskiz)
2. Login: phone → SMS OTP
3. Env: ESKIZ_EMAIL, ESKIZ_PASSWORD
4. Without Eskiz (dev only): OTP returned as `devCode` / bypass `000000`

## Kassa POS (loyalty — Korzinka uslubi)
1. Mijoz ilovada **Mening QR** — dinamik imzolangan kod (90s TTL)
2. Kassir Admin → **Kassa POS**: skan → summa → cashback ishlatish → tasdiq → chek
3. API: `POST /api/pos/lookup|preview|sale|void`, `GET /api/pos/card|sales`
4. FOM walk-in: `POST /api/integrations/fom/sale` with `{ customerQr, amount, branchId, receiptId }`
5. Env: `POS_SECRET` (QR imzo kaliti)
6. Darajalar: Silver 3% · Gold 5% · Platinum 7%

## Checklist before App Store / Play
- [ ] Postgres + backups
- [ ] Eskiz SMS live
- [ ] HTTPS API domain
- [ ] Privacy policy + terms URLs in store listing
- [ ] EAS production build (AAB + iOS)
- [ ] Remove/hide `devCode` in production (automatic when Eskiz set)
- [ ] POS_SECRET set; kassa staff trained on QR flow
