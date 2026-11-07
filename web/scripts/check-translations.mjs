// Checks web/public/i18n/<code>.json against en.json: every string translated, placeholders kept.
//   node scripts/check-translations.mjs            # all languages that have a file
//   node scripts/check-translations.mjs pl ro      # just these
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "i18n");
const en = JSON.parse(readFileSync(join(dir, "en.json"), "utf8"));
const codes = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "en.json").map((f) => f.slice(0, -5));
const tokens = (s) => [...s.matchAll(/\{\d+\}|£\d+(?:\.\d+)?/g)].map((m) => m[0]).sort().join(" ");
let failed = 0;
for (const code of codes) {
  const file = join(dir, `${code}.json`);
  if (!existsSync(file)) { console.log(`${code}: MISSING FILE`); failed++; continue; }
  let t;
  try { t = JSON.parse(readFileSync(file, "utf8")); } catch (e) { console.log(`${code}: INVALID JSON ${e.message}`); failed++; continue; }
  const problems = [];
  for (const s of en) {
    const v = t[s];
    if (typeof v !== "string" || !v.trim()) problems.push(`missing: ${s}`);
    else if (tokens(v) !== tokens(s)) problems.push(`placeholders differ: ${s} -> ${v}`);
  }
  const extra = Object.keys(t).filter((k) => !en.includes(k));
  if (extra.length) problems.push(`${extra.length} keys not in en.json`);
  const same = en.filter((s) => t[s] === s && /[a-z]{4,}/i.test(s.replace(/\{\d+\}/g, ""))).length;
  console.log(`${code}: ${problems.length ? "FAIL" : "ok"} (${en.length - problems.length}/${en.length}, ${same} left identical to English)`);
  problems.slice(0, 8).forEach((p) => console.log("   " + p));
  if (problems.length) failed++;
}
process.exit(failed ? 1 : 0);
