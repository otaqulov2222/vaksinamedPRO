/**
 * Staging/live HTTP role smoke — HQ vs cashier GET matrix + optional settings dry-run.
 *
 * Env:
 *   STAGING_BASE_URL   e.g. https://77-83-206-192.sslip.io
 *   SMOKE_HQ_TOKEN / SMOKE_CASHIER_TOKEN   preferred when WebAuthn blocks password login
 *   OR SMOKE_HQ_EMAIL / SMOKE_HQ_PASSWORD + SMOKE_CASHIER_EMAIL / SMOKE_CASHIER_PASSWORD
 *   SMOKE_WRITE=1      optional: PATCH settings spend ratio then restore (HQ only)
 *
 * Usage:
 *   npx tsx src/scripts/admin-staging-role-smoke.ts
 *
 * On staging (APP_ENV=staging) password login returns WEBAUTHN_REQUIRED — mint
 * short-lived sessions with admin-staging-role-smoke-mint.ts on the host, then
 * pass SMOKE_*_TOKEN.
 */
import assert from "node:assert/strict";

const BASE = String(process.env.STAGING_BASE_URL || "").replace(/\/$/, "");
const HQ_TOKEN_ENV = String(process.env.SMOKE_HQ_TOKEN || "");
const CASHIER_TOKEN_ENV = String(process.env.SMOKE_CASHIER_TOKEN || "");
const HQ_EMAIL = String(process.env.SMOKE_HQ_EMAIL || "");
const HQ_PASSWORD = String(process.env.SMOKE_HQ_PASSWORD || "");
const CASHIER_EMAIL = String(process.env.SMOKE_CASHIER_EMAIL || "");
const CASHIER_PASSWORD = String(process.env.SMOKE_CASHIER_PASSWORD || "");
const WRITE = process.env.SMOKE_WRITE === "1";

if (!BASE) {
  console.error("STAGING_BASE_URL required");
  process.exit(2);
}

type LoginResult = { token: string; role: string; branchId: number | null; permissions: string[] };

async function api(
  path: string,
  opts: { token?: string; method?: string; body?: unknown } = {},
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method || "GET",
    headers: {
      "content-type": "application/json",
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

async function meFromToken(token: string): Promise<LoginResult> {
  const me = await api("/api/admin/me", { token });
  assert.equal(me.status, 200, `admin/me → ${me.status}`);
  return {
    token,
    role: String(me.json?.user?.role || ""),
    branchId: me.json?.user?.branchId != null ? Number(me.json.user.branchId) : null,
    permissions: Array.isArray(me.json?.permissions) ? me.json.permissions.map(String) : [],
  };
}

async function login(email: string, password: string): Promise<LoginResult> {
  const { status, json } = await api("/api/admin/login", {
    method: "POST",
    body: { email, password },
  });
  if (status === 200 && (json?.status === "WEBAUTHN_REQUIRED" || json?.status === "WEBAUTHN_ENROLL" || json?.code === "WEBAUTHN_REQUIRED")) {
    throw Object.assign(
      new Error(
        `WEBAUTHN_REQUIRED for ${email}: password login cannot issue a session on staging. Mint SMOKE_*_TOKEN via admin-staging-role-smoke-mint.ts on the host.`,
      ),
      { code: "WEBAUTHN_BLOCKED" },
    );
  }
  assert.equal(status, 200, `login failed for ${email}: ${status} ${JSON.stringify(json)?.slice(0, 160)}`);
  const token = String(json?.token || json?.accessToken || "");
  assert.ok(token, `token missing for ${email} (status field=${json?.status || "n/a"})`);
  return meFromToken(token);
}

async function expectStatus(
  label: string,
  path: string,
  token: string,
  allowed: number[],
) {
  const { status, json } = await api(path, { token });
  assert.ok(
    allowed.includes(status),
    `${label} ${path} → ${status} (want ${allowed.join("|")}) ${JSON.stringify(json)?.slice(0, 120)}`,
  );
  console.log(`  OK ${label} ${status} ${path}`);
}

async function resolveActor(
  label: string,
  tokenEnv: string,
  email: string,
  password: string,
): Promise<LoginResult> {
  if (tokenEnv) {
    console.log(`${label}: using SMOKE_*_TOKEN`);
    return meFromToken(tokenEnv);
  }
  assert.ok(email && password, `${label}: set SMOKE_*_TOKEN or email/password`);
  return login(email, password);
}

async function run() {
  console.log(`Smoke against ${BASE}`);

  const hq = await resolveActor("HQ", HQ_TOKEN_ENV, HQ_EMAIL, HQ_PASSWORD);
  const cashier = await resolveActor("Cashier", CASHIER_TOKEN_ENV, CASHIER_EMAIL, CASHIER_PASSWORD);
  console.log(`HQ role=${hq.role} perms=${hq.permissions.length}`);
  console.log(`Cashier role=${cashier.role} branch=${cashier.branchId} perms=${cashier.permissions.length}`);

  const hqGets = [
    "/api/admin/dashboard",
    "/api/admin/orders?limit=5",
    "/api/admin/reports?createdFrom=2020-01-01&createdTo=2020-01-07",
    "/api/admin/audit?limit=5",
    "/api/admin/ratings?limit=5",
    "/api/cashback/rules",
    "/api/admin/customers?limit=5",
  ];
  console.log("HQ GET matrix");
  for (const p of hqGets) await expectStatus("HQ", p, hq.token, [200]);

  console.log("Cashier GET matrix");
  await expectStatus("cashier", "/api/admin/orders?limit=5", cashier.token, [200, 403]);
  await expectStatus("cashier", "/api/admin/dashboard", cashier.token, [200, 403]);
  await expectStatus("cashier", "/api/admin/reports?createdFrom=2020-01-01&createdTo=2020-01-07", cashier.token, [403]);
  await expectStatus("cashier", "/api/admin/audit?limit=1", cashier.token, [403]);
  await expectStatus("cashier", "/api/admin/settings/cashback", cashier.token, [403]);

  if (cashier.branchId != null) {
    const foreign = cashier.branchId === 1 ? 99999 : 1;
    await expectStatus(
      "cashier-idor",
      `/api/admin/orders?limit=1&branchId=${foreign}`,
      cashier.token,
      [200, 403],
    );
  }

  // Unauthenticated probe
  await expectStatus("anon", "/api/admin/audit?limit=1", "", [401]);

  if (WRITE) {
    console.log("HQ write smoke (settings spend ratio round-trip)");
    const before = await api("/api/cashback/rules");
    assert.equal(before.status, 200);
    const prevPct = Number(before.json?.maxSpendPercent);
    const nextPct = prevPct === 30 ? 31 : 30;
    const patch = await api("/api/admin/settings/cashback", {
      token: hq.token,
      method: "PATCH",
      body: { maxSpendRatio: nextPct / 100 },
    });
    assert.equal(patch.status, 200, `settings patch ${patch.status}`);
    const restore = await api("/api/admin/settings/cashback", {
      token: hq.token,
      method: "PATCH",
      body: { maxSpendRatio: prevPct / 100 },
    });
    assert.equal(restore.status, 200, `settings restore ${restore.status}`);
    console.log(`  OK spend ratio ${prevPct}% → ${nextPct}% → ${prevPct}%`);
  } else {
    console.log("Write smoke skipped (set SMOKE_WRITE=1 to enable)");
  }

  console.log("PASS admin-staging-role-smoke");
}

run().catch((err) => {
  const code = (err as { code?: string })?.code;
  if (code === "WEBAUTHN_BLOCKED") {
    console.error("BLOCKED", (err as Error).message);
    process.exit(3);
  }
  console.error("FAIL", err);
  process.exit(1);
});
