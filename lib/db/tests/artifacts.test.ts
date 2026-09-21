import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getMigrationsFolder } from "../src/migrationsPath";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("P1 migration artifacts", () => {
  it("has journal and baseline SQL on disk", () => {
    const folder = getMigrationsFolder();
    assert.ok(existsSync(path.join(folder, "meta", "_journal.json")));
    assert.ok(existsSync(path.join(folder, "0000_baseline.sql")));
    assert.ok(existsSync(path.join(folder, "0001_sessions_rbac.sql")));
    assert.ok(existsSync(path.join(folder, "0002_inventory_foundation.sql")));
    assert.ok(existsSync(path.join(folder, "0003_inventory_unique.sql")));
    assert.ok(existsSync(path.join(folder, "0004_inventory_adjust_permission.sql")));
    assert.ok(existsSync(path.join(folder, "0005_order_axes.sql")));
    assert.ok(existsSync(path.join(folder, "0006_cashback_foundation.sql")));
    assert.ok(existsSync(path.join(folder, "0007_payment_foundation.sql")));
    assert.ok(existsSync(path.join(folder, "0008_delivery_fom_workers.sql")));
  });

  it("journal lists baseline in order", () => {
    const journal = JSON.parse(
      readFileSync(path.join(getMigrationsFolder(), "meta", "_journal.json"), "utf8"),
    );
    assert.equal(journal.dialect, "postgresql");
    assert.equal(journal.entries[0].tag, "0000_baseline");
    assert.equal(journal.entries[0].idx, 0);
    assert.equal(journal.entries[1].tag, "0001_sessions_rbac");
    assert.equal(journal.entries[1].idx, 1);
    assert.equal(journal.entries[2].tag, "0002_inventory_foundation");
    assert.equal(journal.entries[2].idx, 2);
    assert.equal(journal.entries[3].tag, "0003_inventory_unique");
    assert.equal(journal.entries[3].idx, 3);
    assert.equal(journal.entries[4].tag, "0004_inventory_adjust_permission");
    assert.equal(journal.entries[4].idx, 4);
    assert.equal(journal.entries[5].tag, "0005_order_axes");
    assert.equal(journal.entries[5].idx, 5);
    assert.equal(journal.entries[6].tag, "0006_cashback_foundation");
    assert.equal(journal.entries[6].idx, 6);
    assert.equal(journal.entries[7].tag, "0007_payment_foundation");
    assert.equal(journal.entries[7].idx, 7);
    assert.equal(journal.entries[8].tag, "0008_delivery_fom_workers");
    assert.equal(journal.entries[8].idx, 8);
  });

  it("P6 cashback migration enforces integer money + earn uniqueness", () => {
    const sql = readFileSync(path.join(getMigrationsFolder(), "0006_cashback_foundation.sql"), "utf8");
    assert.match(sql, /cashback_accounts/);
    assert.match(sql, /cashback_ledger/);
    assert.match(sql, /commercial_transactions/);
    assert.match(sql, /balance integer/);
    assert.match(sql, /amount integer/);
    assert.match(sql, /cashback_ledger_earn_commercial_uidx/);
    assert.match(sql, /reverses_entry_id/);
    assert.match(sql, /entry_type IN \('EARN', 'USE', 'REVERSAL', 'ADJUSTMENT'\)/);
    assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE/i);
  });

  it("P7 payment migration is additive with integer money + capture uniqueness", () => {
    const sql = readFileSync(path.join(getMigrationsFolder(), "0007_payment_foundation.sql"), "utf8");
    assert.match(sql, /payment_intents/);
    assert.match(sql, /payment_attempts/);
    assert.match(sql, /payment_captures/);
    assert.match(sql, /payment_refunds/);
    assert.match(sql, /payment_webhook_events/);
    assert.match(sql, /amount integer/);
    assert.match(sql, /currency text/);
    assert.match(sql, /payment_captures_intent_uidx/);
    assert.match(sql, /payment_captures_order_uidx/);
    assert.match(sql, /payment_webhook_events_provider_event_uidx/);
    assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE|DELETE FROM/i);
  });

  it("baseline preserves integer money/quantity semantics (no float money)", () => {
    const sql = readFileSync(path.join(getMigrationsFolder(), "0000_baseline.sql"), "utf8");
    assert.match(sql, /price integer/);
    assert.match(sql, /amount integer/);
    assert.match(sql, /balance integer/);
    assert.match(sql, /cashback_used integer/);
    assert.match(sql, /quantity integer/);
    assert.doesNotMatch(sql, /price double|price real|balance double|amount numeric/i);
  });

  it("documents push-force guard script", () => {
    assert.ok(existsSync(path.join(root, "scripts", "push-guard.mjs")));
  });
});
