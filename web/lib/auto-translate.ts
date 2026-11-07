/**
 * Whole-app translation. When a language is chosen, every piece of English UI copy on screen
 * (text, aria-label, placeholder, title, alt) is swapped for its translation from
 * public/i18n/<code>.json (made from public/i18n/en.json by scripts/extract-strings.mjs).
 * Sentences built from data ("You're good until {0}") are matched as patterns, and dates and
 * weekday labels inside them are re-written in the chosen language with Intl. A MutationObserver
 * keeps new screens and loaded data translated; choosing "Off" restores the English.
 * Translations were written by Claude: a native-speaker check is needed before launch.
 */
import { LANGUAGES } from "./languages";

type Catalog = { exact: Map<string, string>; patterns: { re: RegExp; to: string }[] };

const ATTRS = ["aria-label", "placeholder", "title", "alt"] as const;
const SKIP = "script,style,textarea,input,select,code,pre,[data-no-translate],[contenteditable]";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const TWO = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const catalogs = new Map<string, Promise<Catalog | null>>();
const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Builds the lookup from a language file: exact strings, and patterns for sentences with {0}. */
export function compile(table: Record<string, string>): Catalog {
  const exact = new Map<string, string>();
  const patterns: Catalog["patterns"] = [];
  const slots = (x: string) => (x.match(/\{\d+\}/g) ?? []).sort().join();
  for (const [en, to] of Object.entries(table)) {
    // A translation that lost or swapped a {0} is wrong: keep the English for that string.
    if (typeof to !== "string" || !to.trim() || slots(en) !== slots(to)) continue;
    if (/\{\d+\}/.test(en)) {
      const src = escape(en).replace(/\\{(\d+)\\}/g, "(?<p$1>.+?)");
      patterns.push({ re: new RegExp(`^${src}$`), to });
    } else exact.set(norm(en), to);
  }
  // Most specific (longest literal text) first.
  const literal = (re: RegExp) => re.source.replace(/\(\?<p\d+>\.\+\?\)/g, "").length;
  patterns.sort((a, b) => literal(b.re) - literal(a.re));
  return { exact, patterns };
}

function load(code: string): Promise<Catalog | null> {
  if (!catalogs.has(code)) {
    catalogs.set(
      code,
      fetch(`/i18n/${code}.json`)
        .then((r) => (r.ok ? (r.json() as Promise<Record<string, string>>) : null))
        .then((table) => (table ? compile(table) : null))
        .catch(() => null),
    );
  }
  return catalogs.get(code)!;
}

/** "Thu 19 March", "19 March", "Thursday 19 March", "23 Mar" -> the same date in the chosen language. */
function localDate(text: string, code: string): string | null {
  const m = text.match(/^(?:(Mon|Tue|Wed|Thu|Fri|Sat|Sun|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),? )?(\d{1,2}) ([A-Z][a-z]+)$/);
  if (!m) return null;
  const month = MONTHS.findIndex((x) => x === m[3] || x.slice(0, 3) === m[3]);
  if (month < 0) return null;
  const year = new Date().getFullYear() - (month > new Date().getMonth() + 6 ? 1 : 0);
  // The demo lives in March 2026; pick the year whose weekday matches when one is given.
  const candidates = [2026, year, year + 1, year - 1];
  const wanted = m[1] ? Math.max(DAYS.indexOf(m[1].slice(0, 3)), DAYS_LONG.indexOf(m[1])) : -1;
  const y = candidates.find((c) => wanted < 0 || new Date(Date.UTC(c, month, +m[2])).getUTCDay() === wanted) ?? year;
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: m[3].length <= 3 ? "short" : "long", timeZone: "UTC" };
  if (m[1]) opts.weekday = m[1].length > 3 ? "long" : "short";
  try {
    return new Intl.DateTimeFormat(code, opts).format(new Date(Date.UTC(y, month, +m[2])));
  } catch {
    return null;
  }
}

function translate(original: string, code: string, cat: Catalog): string {
  const t = norm(original);
  if (!t) return original;
  const lead = original.match(/^\s*/)![0];
  const trail = original.match(/\s*$/)![0];
  const exact = cat.exact.get(t);
  if (exact !== undefined) return lead + exact + trail;
  const two = TWO.indexOf(t);
  if (two >= 0) {
    try {
      return lead + new Intl.DateTimeFormat(code, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 2, 1 + two))) + trail;
    } catch {
      return original;
    }
  }
  const date = localDate(t, code);
  if (date) return lead + date + trail;
  for (const { re, to } of cat.patterns) {
    const m = t.match(re);
    if (!m?.groups) continue;
    const filled = to.replace(/\{(\d+)\}/g, (_, i: string) => {
      const v = m.groups![`p${i}`] ?? "";
      return cat.exact.get(norm(v)) ?? localDate(norm(v), code) ?? v;
    });
    return lead + filled + trail;
  }
  return original;
}

// ---------- DOM ----------
const originalText = new WeakMap<Text, string>();
const shownText = new WeakMap<Text, string>();
const originalAttrs = new WeakMap<Element, Partial<Record<(typeof ATTRS)[number], string>>>();
let observer: MutationObserver | null = null;
let active: { code: string; cat: Catalog } | null = null;

function skipped(node: Node): boolean {
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  return !el || !!el.closest(SKIP);
}

function applyText(node: Text) {
  if (!active || skipped(node)) return;
  const current = node.nodeValue ?? "";
  // React replaced the text since we translated it: that is the new English.
  if (shownText.get(node) !== current) originalText.set(node, current);
  const next = translate(originalText.get(node) ?? current, active.code, active.cat);
  shownText.set(node, next);
  if (next !== current) node.nodeValue = next;
}

function applyAttrs(el: Element) {
  if (!active || el.closest(SKIP)) return;
  const saved = originalAttrs.get(el) ?? {};
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (v == null) continue;
    if (saved[a] === undefined || (el as HTMLElement).dataset[`pactShown${a.replace("-", "")}`] !== v) saved[a] = v;
    const next = translate(saved[a]!, active.code, active.cat);
    (el as HTMLElement).dataset[`pactShown${a.replace("-", "")}`] = next;
    if (next !== v) el.setAttribute(a, next);
  }
  originalAttrs.set(el, saved);
}

function applyTree(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) return applyText(root as Text);
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  applyAttrs(root as Element);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) applyText(n as Text);
    else applyAttrs(n as Element);
  }
}

function restore() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) {
      const o = originalText.get(n as Text);
      if (o !== undefined && n.nodeValue === shownText.get(n as Text)) n.nodeValue = o;
      shownText.delete(n as Text);
    } else {
      const saved = originalAttrs.get(n as Element);
      if (saved) for (const [a, v] of Object.entries(saved)) (n as Element).setAttribute(a, v!);
    }
  }
}

/** Translate the whole app into `code`, or back to English with null. */
let request = 0;

export async function setPageLanguage(code: string | null): Promise<void> {
  const mine = ++request;
  const html = document.documentElement;
  const lang = code ? LANGUAGES.find((l) => l.code === code) : undefined;
  if (!code || !lang) {
    observer?.disconnect();
    observer = null;
    if (active) restore();
    active = null;
    html.lang = "en";
    html.dir = "ltr";
    return;
  }
  const cat = await load(code);
  if (!cat || mine !== request) return; // missing language, or a newer choice was made meanwhile
  if (active?.code !== code && active) restore();
  active = { code, cat };
  html.lang = code;
  html.dir = lang.dir;
  applyTree(document.body);
  if (!observer) {
    observer = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === "characterData") applyText(r.target as Text);
        else if (r.type === "attributes") applyAttrs(r.target as Element);
        else r.addedNodes.forEach(applyTree);
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
  }
}

/** Exposed for tests. */
export const _internals = { translate, localDate };
