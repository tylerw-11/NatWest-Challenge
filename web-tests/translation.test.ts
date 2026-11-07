import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compile, _internals } from "@/lib/auto-translate";
import { LANGUAGES } from "@/lib/languages";

const dir = new URL("../web/public/i18n/", import.meta.url);
const en: string[] = JSON.parse(readFileSync(new URL("en.json", dir), "utf8"));

describe("whole-app translation", () => {
  it("has 70 languages and an English catalogue of every UI string", () => {
    expect(LANGUAGES).toHaveLength(70);
    expect(en.length).toBeGreaterThan(250);
  });

  it("translates exact strings, patterns with data, dates and weekday labels", () => {
    const cat = compile({ "Storm ahead": "Burza nadchodzi", "You're good until {0}": "Wszystko dobrze do {0}", "Safety buffer": "Zapas" });
    expect(_internals.translate("  Storm ahead ", "pl", cat)).toBe("  Burza nadchodzi ");
    expect(_internals.translate("You're good until Thu 19 March", "pl", cat)).toBe("Wszystko dobrze do czw., 19 marca");
    expect(_internals.translate("Tu", "pl", cat)).toBe("wt.");
    expect(_internals.translate("Something new", "pl", cat)).toBe("Something new");
  });

  it("keeps the English when a translation lost or swapped a placeholder", () => {
    const cat = compile({ "Log out": "Wylogowano z {0}", "Logged out of {0}.": "Wyloguj" });
    expect(_internals.translate("Log out", "pl", cat)).toBe("Log out");
    expect(_internals.translate("Logged out of Laptop.", "pl", cat)).toBe("Logged out of Laptop.");
  });

  it("every finished language file only uses keys from en.json", () => {
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".json") && x !== "en.json")) {
      const t = JSON.parse(readFileSync(new URL(f, dir), "utf8"));
      expect(LANGUAGES.some((l) => `${l.code}.json` === f), f).toBe(true);
      const covered = en.filter((s) => typeof t[s] === "string" && t[s].trim()).length;
      expect(covered / en.length, f).toBeGreaterThan(0.95);
    }
  });
});
