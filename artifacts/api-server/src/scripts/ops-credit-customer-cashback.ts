/**
 * One-shot HQ cashback credit by phone (ops / test accounts).
 *
 * Run on the API host with the same DATABASE_URL as the live API:
 *   npx tsx src/scripts/ops-credit-customer-cashback.ts --phone 889799737 --amount 300000 --reason "test credit for QA"
 *
 * Idempotent via --idempotency-key (default derived from phone+amount+reason).
 */
import { sql } from "drizzle-orm";
import { customers, db } from "@workspace/db";
import { earnCashback } from "../lib/cashbackFinance";

function arg(name: string, fallback = ""): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return String(process.argv[i + 1]).trim();
  return fallback;
}

async function main() {
  const phone = arg("phone");
  const amount = Math.floor(Number(arg("amount", "0")) || 0);
  const reason = arg("reason", "ops test credit");
  const idempotencyKey = arg(
    "idempotency-key",
    `ops-credit:${phone}:${amount}:${reason}`.replace(/\s+/g, "_").slice(0, 120),
  );

  if (!phone) throw new Error("Missing --phone");
  if (amount <= 0) throw new Error("Missing/invalid --amount");
  if (reason.length < 5) throw new Error("--reason must be at least 5 chars");

  const needle = phone.replace(/\D/g, "").slice(-9);
  const rows = await db
    .select()
    .from(customers)
    .where(sql`regexp_replace(${customers.phone}, '\\D', '', 'g') LIKE ${"%" + needle}`)
    .limit(5);

  if (!rows.length) throw new Error(`Customer not found for phone=${phone}`);
  if (rows.length > 1) {
    throw new Error(`Ambiguous phone match: ${rows.map((r) => `${r.id}:${r.phone}`).join(", ")}`);
  }

  const customer = rows[0];
  const result = await earnCashback({
    customerId: customer.id,
    amount,
    commercial: {
      sourceType: "SYSTEM",
      sourceKey: `ops_adj:${idempotencyKey}`,
      customerId: customer.id,
      amount,
      meta: { direction: "credit", reason, ops: true },
    },
    actor: "ops:credit-script",
    reason: `manual_credit:${reason}`,
    idempotencyKey: `adj:credit:${idempotencyKey}`,
  });

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        customerId: customer.id,
        phone: customer.phone,
        amount,
        idempotent: result.idempotent,
        balance: result.account.balance,
        entryId: result.entry.id,
      },
      null,
      2,
    ) + "\n",
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[ops-credit]", err instanceof Error ? err.message : err);
    process.exit(1);
  });
