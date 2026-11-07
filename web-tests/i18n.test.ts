import { describe, expect, it } from "vitest";
import { KEYS, STRINGS, t } from "@/lib/i18n";
import { LANGUAGES, findLanguage } from "@/lib/languages";

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("languages", () => {
  it("lists exactly 70 languages with unique codes", () => {
    expect(LANGUAGES).toHaveLength(70);
    expect(new Set(LANGUAGES.map((l) => l.code)).size).toBe(70);
  });

  it("flags right-to-left scripts", () => {
    const rtl = LANGUAGES.filter((l) => l.dir === "rtl").map((l) => l.code).sort();
    expect(rtl).toEqual(["ar", "ckb", "fa", "fa-AF", "he", "ps", "ur"].sort());
  });

  it("keeps the codes the earlier picker and scenarios used", () => {
    for (const code of ["pl", "ro", "ur", "ar", "es"]) expect(findLanguage(code), code).toBeDefined();
  });
});

describe("translations", () => {
  it.each(LANGUAGES.map((l) => [l.code]))("%s has every key", (code) => {
    const table = STRINGS[code];
    expect(table, code).toBeDefined();
    for (const key of KEYS) expect(table[key]?.trim(), `${code}.${key}`).toBeTruthy();
  });

  it.each(LANGUAGES.map((l) => [l.code]))("%s keeps every {placeholder}", (code) => {
    for (const key of KEYS) expect(placeholders(STRINGS[code][key]), `${code}.${key}`).toEqual(placeholders(STRINGS.en[key]));
  });
});

describe("t()", () => {
  it("fills dates, amounts, chances and states from engine values", () => {
    expect(t("en", "storm_hero", { chance: 0.33, date: "2026-03-23" })).toBe("1 in 3 chance of going short on Mon 23 March");
    expect(t("en", "most_likely", { amount: 35 })).toBe("Most likely: £35 left");
    expect(t("en", "moved", { amount: 15, date: "2026-03-23", state: "cloudy" })).toBe("£15 moved to your buffer. Mon 23 March now looks tight.");
    const pl = t("pl", "storm_hero", { chance: 0.33, date: "2026-03-23" });
    expect(pl).toContain("1 na 3");
    expect(pl).toMatch(/23/);
    expect(t("pl", "most_likely", { amount: 35 })).toContain("35");
  });

  it("uses Latin digits for every language", () => {
    for (const { code } of LANGUAGES) expect(t(code, "buffer_days", { days: 6 }), code).toMatch(/6/);
  });

  it("falls back to English for unknown languages and keeps base-language matches", () => {
    expect(t("xx", "clear_hero", { date: "2026-03-19" })).toBe("You're good until Thu 19 March");
    expect(t(null, "storm_ahead", { date: "2026-03-23" })).toBe("Storm ahead: Mon 23 March");
    expect(t("pt-PT", "fine")).toBe(STRINGS.pt.fine);
  });
});
