import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const files = [
  "artifacts/api-server/src/routes/admin.ts",
  "artifacts/api-server/src/routes/branches.ts",
  "artifacts/api-server/src/routes/catalog.ts",
  "artifacts/api-server/src/routes/loyalty.ts",
  "artifacts/api-server/src/routes/maps.ts",
  "artifacts/api-server/src/routes/orders.ts",
  "artifacts/api-server/src/routes/payments.ts",
  "artifacts/api-server/src/routes/pos.ts",
];

function needsReturnPrefix(text, start) {
  let i = start - 1;
  while (i >= 0 && /\s/.test(text[i])) i--;
  const before = text.slice(Math.max(0, i - 6), i + 1);
  return !/\breturn\s*$/.test(before);
}

function fixSource(filePath, sourceText) {
  const sf = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const inserts = [];

  function visit(node) {
    if (ts.isCatchClause(node) && node.block) {
      const stmts = node.block.statements;
      if (stmts.length === 1 && ts.isExpressionStatement(stmts[0])) {
        const expr = stmts[0].expression;
        if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression) && expr.expression.text === "next") {
          if (needsReturnPrefix(sourceText, stmts[0].getStart(sf))) {
            inserts.push({ pos: stmts[0].getStart(sf) });
          }
        }
      }
    }

    if (ts.isTryStatement(node) && node.tryBlock) {
      const stmts = node.tryBlock.statements;
      if (stmts.length) {
        const last = stmts[stmts.length - 1];
        if (ts.isExpressionStatement(last)) {
          const text = last.expression.getText(sf);
          if (/^res\.(json|send|redirect|status)\b/.test(text)) {
            if (needsReturnPrefix(sourceText, last.getStart(sf))) {
              inserts.push({ pos: last.getStart(sf) });
            }
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }
  visit(sf);

  inserts.sort((a, b) => b.pos - a.pos);
  let out = sourceText;
  const seen = new Set();
  for (const ins of inserts) {
    if (seen.has(ins.pos)) continue;
    seen.add(ins.pos);
    out = out.slice(0, ins.pos) + "return " + out.slice(ins.pos);
  }
  return { out, count: seen.size };
}

for (const rel of files) {
  const abs = path.resolve(rel);
  const before = fs.readFileSync(abs, "utf8");
  const { out, count } = fixSource(abs, before);
  if (out !== before) {
    if (out.length < before.length) {
      console.error("REFUSE shrink", rel);
      continue;
    }
    fs.writeFileSync(abs, out);
    console.log("fixed", rel, "+", out.length - before.length, "bytes,", count, "inserts");
  } else {
    console.log("noop", rel);
  }
}
