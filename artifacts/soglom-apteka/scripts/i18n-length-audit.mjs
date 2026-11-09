import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "lib/i18n/messages");
const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));

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
        .replace(/\\n/g, " ")
        .replace(/\\'/g, "'")
        .replace(/\\"/g, '"')
        .replace(/\\`/g, "`");
    }
    blocks[loc] = map;
  }
  return blocks;
}

const missing = [];
const spikes = [];
const shortUiRisk = []; // keys used in tight chrome: tabs, chips, buttons

const TIGHT_HINT =
  /(nav|tab|chip|badge|btn|button|action|quick|filter|short|cta|pill|title|label)$/i;

for (const f of files) {
  const src = readFileSync(path.join(dir, f), "utf8");
  const blocks = parseLocaleMaps(src);
  const keys = new Set([
    ...Object.keys(blocks.uz || {}),
    ...Object.keys(blocks.ru || {}),
    ...Object.keys(blocks.en || {}),
  ]);
  for (const k of keys) {
    const uz = blocks.uz?.[k];
    const ru = blocks.ru?.[k];
    const en = blocks.en?.[k];
    if (uz == null || ru == null || en == null) {
      missing.push({ file: f, key: k, uz: uz != null, ru: ru != null, en: en != null });
      continue;
    }
    const lens = { uz: uz.length, ru: ru.length, en: en.length };
    const max = Math.max(lens.uz, lens.ru, lens.en);
    const min = Math.min(lens.uz, lens.ru, lens.en);
    const longest =
      lens.ru >= lens.uz && lens.ru >= lens.en ? "ru" : lens.en >= lens.uz ? "en" : "uz";
    const sample = { uz, ru, en }[longest];
    if (min > 0 && max / min >= 1.7 && max - min >= 10) {
      spikes.push({ file: f, key: k, ...lens, longest, sample: sample.slice(0, 90) });
    }
    // Tight UI risk: any locale string longer than 18 for short-label-ish keys, or >22 always for quick/nav
    if (TIGHT_HINT.test(k) || f === "common.ts" || /quick|filter|nav|badge|chip/i.test(k)) {
      if (max >= 18) {
        shortUiRisk.push({
          file: f,
          key: k,
          ...lens,
          longest,
          sample: sample.slice(0, 60),
        });
      }
    }
  }
}

spikes.sort((a, b) => b.ru + b.en + b.uz - (a.ru + a.en + a.uz));
shortUiRisk.sort((a, b) => Math.max(b.ru, b.en, b.uz) - Math.max(a.ru, a.en, a.uz));

const report = {
  files: files.length,
  missingCount: missing.length,
  spikeCount: spikes.length,
  shortUiRiskCount: shortUiRisk.length,
  missing: missing.slice(0, 50),
  spikes: spikes.slice(0, 50),
  shortUiRisk: shortUiRisk.slice(0, 60),
};

const out = path.join(root, "scripts/i18n-length-audit-report.json");
writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  files: report.files,
  missingCount: report.missingCount,
  spikeCount: report.spikeCount,
  shortUiRiskCount: report.shortUiRiskCount,
  topSpikes: report.spikes.slice(0, 15),
  topTight: report.shortUiRisk.slice(0, 20),
  missingSample: report.missing.slice(0, 15),
}, null, 2));
console.log("WROTE", out);
