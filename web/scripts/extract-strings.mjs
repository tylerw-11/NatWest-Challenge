// Collects every piece of English UI copy in web/app and web/components into
// web/public/i18n/en.json, so the whole app can be translated (see web/lib/auto-translate.ts).
//   node scripts/extract-strings.mjs
// - JSX text, and string literals in copy-bearing JSX attributes (aria-label, placeholder, title, alt, label...)
// - string literals and template literals that read as sentences (a space and a letter), outside
//   className/cn()/imports/keys/URLs. A template literal becomes a pattern: `Hi ${name}` -> "Hi {0}".
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const COPY_ATTRS = new Set(["aria-label", "placeholder", "title", "alt", "label", "headline", "body", "eyebrow", "text", "description", "message", "hint", "note", "caption"]);
const SKIP_ATTRS = new Set(["className", "href", "id", "key", "type", "role", "name", "src", "htmlFor", "autoComplete", "inputMode", "pattern", "lang", "dir", "tone", "variant", "size", "value", "aria-controls", "aria-describedby", "aria-labelledby", "aria-activedescendant"]);
const SKIP_CALLS = new Set(["cn", "clsx", "twMerge", "require", "import", "querySelector", "querySelectorAll", "getItem", "setItem", "removeItem", "startsWith", "endsWith", "includes", "split", "replace", "push", "assign", "matchMedia", "addEventListener", "fetch", "request", "post", "mock", "useQuery", "useMutation", "console.error", "toLocaleDateString", "toLocaleString", "Error"]);

const files = [];
const walk = (d) => readdirSync(d).forEach((f) => {
  const p = join(d, f);
  if (statSync(p).isDirectory()) { if (f !== "dev") walk(p); } else if (/\.tsx?$/.test(f)) files.push(p);
});
walk(join(web, "app"));
walk(join(web, "components"));
// Messages and labels built in lib/ (toasts, errors, fine/tight/storm), not the translation tables themselves.
for (const f of ["api.ts", "format.ts", "read-aloud.ts", "hooks.ts", "colour-mode.ts"]) files.push(join(web, "lib", f));

const out = new Set();
const sentence = (s) => /[A-Za-z]/.test(s) && (/\s/.test(s.trim()) || /^[A-Z][a-z]+[.!?]?$/.test(s.trim())) && !/^[a-z0-9_\-/.:#@[\]()=]+$/.test(s.trim()) && !/^(https?:|\/|#|\.|[a-z-]+:[a-z])/.test(s.trim());
const ENTITIES = { "&apos;": "'", "&quot;": '"', "&amp;": "&", "&rdquo;": "”", "&ldquo;": "“", "&rsquo;": "’", "&lsquo;": "‘", "&nbsp;": " ", "&hellip;": "…", "&middot;": "·", "&pound;": "£" };
const decode = (s) => s.replace(/&[a-z]+;/g, (e) => ENTITIES[e] ?? e);
const add = (raw) => { const s = decode(raw); const t = s.replace(/\s+/g, " ").trim(); if (t.length > 1 && t.length < 300 && /[A-Za-z]/.test(t)) out.add(t); };

function templateToPattern(node) {
  let s = node.head.text;
  node.templateSpans.forEach((span, i) => { s += `{${i}}` + span.literal.text; });
  return s;
}

function inSkippedContext(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isJsxAttribute(p)) { const n = p.name.getText(); return SKIP_ATTRS.has(n) || (!COPY_ATTRS.has(n) && !n.startsWith("aria-")) ? SKIP_ATTRS.has(n) : false; }
    if (ts.isCallExpression(p)) { const n = p.expression.getText(); if (SKIP_CALLS.has(n) || [...SKIP_CALLS].some((c) => n.endsWith("." + c))) return true; }
    if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p)) return true;
    if (ts.isPropertyAssignment(p) && ["className", "href", "id", "key", "kind", "action_id", "code", "level", "value", "state", "tone"].includes(p.name.getText())) return true;
    if (ts.isElementAccessExpression(p)) return true;
    if (ts.isBinaryExpression(p) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(p.operatorToken.kind)) return true;
    if (ts.isCaseClause(p)) return true;
  }
  return false;
}

for (const file of files) {
  const src = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const visit = (node) => {
    if (ts.isJsxText(node)) add(node.text);
    else if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer) && COPY_ATTRS.has(node.name.getText())) add(node.initializer.text);
    else if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && sentence(node.text) && !inSkippedContext(node)) add(node.text);
    else if (ts.isTemplateExpression(node) && !inSkippedContext(node)) { const p = templateToPattern(node); if (sentence(p.replace(/\{\d+\}/g, "x"))) add(p); }
    ts.forEachChild(node, visit);
  };
  visit(src);
}

// Not copy: Tailwind class lists, SVG path data, directives, HTML entities.
const notCopy = (t) =>
  t === "use client" ||
  /^rotate\(|^translate\(|^scale\(/.test(t) ||
  /\[contenteditable\]|^input, /.test(t) ||
  /^[“”.,;:]+$/.test(t) ||
  /^&[a-z]+;$/.test(t) ||
  /^[MLZHVCSQTAmlzhvcsqta0-9 ,.{}\-]+$/.test(t) ||
  t.split(" ").every((w) => /^[a-z0-9:[\]\-./%#()!]+$/.test(w)) && t.split(" ").some((w) => /[-:[]/.test(w));
// The engine's plain-language error messages (fail(status, code, "message")) are shown on screen too.
const engineDir = join(web, "..", "engine");
const pyFiles = [];
const walkPy = (d) => readdirSync(d).forEach((f) => {
  const p = join(d, f);
  if (statSync(p).isDirectory()) { if (!["tests", "__pycache__", ".speech_cache"].includes(f)) walkPy(p); } else if (f.endsWith(".py")) pyFiles.push(p);
});
walkPy(engineDir);
for (const f of pyFiles) for (const m of readFileSync(f, "utf8").matchAll(/fail\(\s*\d+\s*,\s*"[a-z_]+"\s*,\s*"((?:\\.|[^"\\])*)"/g)) add(m[1].replace(/\\"/g, '"'));
// Text that arrives as data and is shown as-is: rule wording, bill names, cause notes, the demo
// note (web/mocks/*.json and the engine's own labels). f-string fields become {0}, {1}...
const DATA_KEYS = new Set(["label", "source_note", "when_label", "then_label", "text", "headline", "body", "eyebrow"]);
const walkJson = (v) => {
  if (Array.isArray(v)) v.forEach(walkJson);
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { if (typeof x === "string" && DATA_KEYS.has(k)) add(x); else walkJson(x); }
};
for (const f of readdirSync(join(web, "mocks")).filter((f) => f.endsWith(".json"))) walkJson(JSON.parse(readFileSync(join(web, "mocks", f), "utf8")));
const fstring = (t) => { let i = 0; return t.replace(/\{[^{}]+\}/g, () => `{${i++}}`); };
for (const f of pyFiles) {
  const py = readFileSync(f, "utf8");
  for (const m of py.matchAll(/\b(?:then_label|when_label|label|source_note)\s*=\s*(f?)"((?:\\.|[^"\\])*)"/g)) add(m[1] ? fstring(m[2]) : m[2]);
  for (const m of py.matchAll(/"(?:label|source_note|when_label|then_label)":\s*(f?)"((?:\\.|[^"\\])*)"/g)) add(m[1] ? fstring(m[2]) : m[2]);
}
const sorted = [...out].filter((t) => !notCopy(t)).sort();
mkdirSync(join(web, "public", "i18n"), { recursive: true });
writeFileSync(join(web, "public", "i18n", "en.json"), JSON.stringify(sorted, null, 1) + "\n");
console.log(`${sorted.length} strings from ${files.length} files -> public/i18n/en.json`);
