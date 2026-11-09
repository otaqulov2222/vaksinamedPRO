import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "lib/i18n/messages");

function parseLocaleMaps(src) {
  const blocks = {};
  for (const loc of ["uz", "ru", "en"]) {
    const marker = `${loc}: {`;
    const start = src.indexOf(marker);
    if (start < 0) continue;
    let i = start + marker.length;
    let depth = 1;
    let end = i;
    while (end < src.length && depth > 0) {
      const ch = src[end];
      if (ch === "{") depth += 1;
      else if (ch === "}") depth -= 1;
      end += 1;
    }
    const block = src.slice(i, end - 1);
    const map = {};
    const re =
      /([A-Za-z0-9_]+):\s*(?:'((?:\\'|[^'])*)'|"((?:\\"|[^"])*)"|`((?:\\`|[^`])*)`)/g;
    let m;
    while ((m = re.exec(block))) {
      const raw = m[2] ?? m[3] ?? m[4] ?? "";
      map[m[1]] = raw
        .replace(/\\n/g, "\n")
        .replace(/\\'/g, "'")
        .replace(/\\"/g, '"')
        .replace(/\\`/g, "`");
    }
    blocks[loc] = map;
  }
  return blocks;
}

const interest = {
  common: [
    "navHome",
    "navCatalog",
    "navOrders",
    "navProfile",
    "navBranches",
    "navQr",
    "navCashback",
    "showAll",
    "retry",
    "cancel",
    "save",
    "continue",
    "back",
  ],
  home: [
    "quickSearch",
    "quickPrescription",
    "quickDelivery",
    "categoryPain",
    "categoryCold",
    "categoryVitamins",
    "categoryAll",
    "repeatAction",
    "branchChoose",
    "featuredProducts",
    "heroSlogan",
    "promotionsSectionTitle",
    "cashbackBadge",
    "otcBadge",
    "repeatStrip",
    "greeting",
    "balanceLabel",
    "stockInBranch",
    "stockOutBranch",
  ],
  orders: ["fiscalChequeBtn", "listSubtitle", "cancelConfirmTitle"],
  status: ["reservation_CANCELLED", "reservation_EXPIRED", "payment_PAID", "order_PENDING"],
};

for (const [file, keys] of Object.entries(interest)) {
  const blocks = parseLocaleMaps(readFileSync(path.join(dir, `${file}.ts`), "utf8"));
  for (const k of keys) {
    const uz = blocks.uz?.[k] ?? null;
    const ru = blocks.ru?.[k] ?? null;
    const en = blocks.en?.[k] ?? null;
    if (!uz && !ru && !en) continue;
    const lens = { uz: uz?.length ?? 0, ru: ru?.length ?? 0, en: en?.length ?? 0 };
    const max = Math.max(lens.uz, lens.ru, lens.en);
    const min = Math.min(...Object.values(lens).filter((n) => n > 0));
    console.log(
      JSON.stringify({
        key: `${file}.${k}`,
        lens,
        ratio: min ? Number((max / min).toFixed(2)) : null,
        uz,
        ru,
        en,
      }),
    );
  }
}
