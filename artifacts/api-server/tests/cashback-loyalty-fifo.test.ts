import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  birthdayExtraBps,
  isBirthdayWindow,
  nextTier,
  publicCashbackRules,
  tierProgress,
  WELCOME_BONUS_UZS,
  BIRTHDAY_EXTRA_BPS,
  CASHBACK_TTL_DAYS,
} from "../src/lib/cashback";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n");

describe("Loyalty FIFO / birthday / welcome", () => {
  it("public rules advertise enforced FIFO TTL and welcome bonus", () => {
    const rules = publicCashbackRules(0.3);
    assert.equal(rules.ttlDays, CASHBACK_TTL_DAYS);
    assert.equal(rules.ttlEnforced, true);
    assert.equal(rules.fifo, true);
    assert.equal(rules.welcomeBonus, WELCOME_BONUS_UZS);
    assert.equal(rules.birthdayExtraBps, BIRTHDAY_EXTRA_BPS);
  });

  it("birthday window covers 7 days including year wrap", () => {
    assert.equal(isBirthdayWindow("1990-01-02", new Date("2026-01-05T12:00:00")), true);
    assert.equal(isBirthdayWindow("1990-01-02", new Date("2026-01-20T12:00:00")), false);
    assert.equal(isBirthdayWindow("1990-12-30", new Date("2026-01-02T12:00:00")), true);
    assert.equal(birthdayExtraBps("1990-01-02", new Date("2026-01-05T12:00:00")), BIRTHDAY_EXTRA_BPS);
    assert.equal(birthdayExtraBps(null, new Date()), 0);
  });

  it("tier progress reports remaining to Gold/Platinum", () => {
    const silver = tierProgress(200_000, "Silver");
    assert.equal(silver.current, "Silver");
    assert.equal(silver.next, "Gold");
    assert.equal(silver.remaining, 800_000);
    const top = tierProgress(5_000_000, "Gold");
    assert.equal(nextTier(5_000_000, "Gold"), "Platinum");
    assert.equal(top.next, null);
    assert.equal(top.remaining, 0);
  });

  it("engine writes grants and EXPIRE via cashbackFinance; worker sweeps TTL", () => {
    const finance = read("src/lib/cashbackFinance.ts");
    const workers = read("src/lib/workers.ts");
    const loyalty = read("src/routes/loyalty.ts");
    const cart = read("src/routes/cart.ts");
    assert.match(finance, /consumeGrantsFifo/);
    assert.match(finance, /expireDueCashbackGrants/);
    assert.match(finance, /entryType: "EXPIRE"/);
    assert.match(finance, /INSUFFICIENT_ACTIVE_GRANTS/);
    assert.doesNotMatch(finance, /gap_cover/);
    assert.match(workers, /CASHBACK_TTL_SWEEP/);
    assert.match(loyalty, /birthDate/);
    assert.match(loyalty, /tierProgress/);
    assert.match(cart, /router.post\("\/cart\/repeat"/);
  });

  it("register welcome bonus uses the published constant", () => {
    const auth = read("src/lib/auth.ts");
    assert.match(auth, /WELCOME_BONUS_UZS/);
    assert.match(auth, /reason: "welcome_bonus"/);
  });
});
