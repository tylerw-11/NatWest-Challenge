// Real engine responses, parsed with the frontend's contracts (decision 0001).
// The fixture is written by `pytest engine/tests` (test_demo_contract.py), so run pytest first
// after any engine change. If this fails, the engine and web/lib/contracts.ts disagree.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Forecast, Me, PactRules, Rewind, Settings, UIBlock } from "@/lib/contracts";
import { FORECASTS, PACT_RULES, REWINDS } from "@/mocks/scenarios";

const engine = JSON.parse(readFileSync(new URL("./fixtures/engine-responses.json", import.meta.url), "utf8"));

describe("engine responses pass the web contracts", () => {
  it.each([
    ["forecast", Forecast],
    ["moveToBuffer", Forecast],
    ["rewind", Rewind],
    ["settings", Settings],
    ["me", Me],
    ["pactRules", PactRules],
    ["explain", UIBlock],
  ] as const)("%s", (key, schema) => {
    const r = schema.safeParse(engine[key]);
    expect(r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`)).toEqual([]);
  });
});

describe("engine and mocks tell the same demo story", () => {
  const e = Forecast.parse(engine.forecast);
  const after = Forecast.parse(engine.moveToBuffer);
  const states = (f: typeof e) => f.days.map((d) => d.state).slice(0, 14).join(",");
  it("same first 14 days of weather, same storm, same best action", () => {
    expect(states(e)).toBe(states(FORECASTS.demo));
    expect(e.covered_until).toBe(FORECASTS.demo.covered_until);
    expect(e.buffer_days).toBe(FORECASTS.demo.buffer_days);
    expect(e.best_action).toEqual(FORECASTS.demo.best_action);
  });
  it("same result after moving £15", () => {
    expect(states(after)).toBe(states(FORECASTS.demo_after_buffer));
    expect(after.best_action).toBeNull();
    expect(after.buffer_days).toBe(FORECASTS.demo_after_buffer.buffer_days);
  });
  it("same rewind months and totals", () => {
    const r = Rewind.parse(engine.rewind);
    expect(r.months).toEqual(REWINDS.demo.months);
    expect([r.total_gbp, r.kept_with_pact_gbp]).toEqual([REWINDS.demo.total_gbp, REWINDS.demo.kept_with_pact_gbp]);
  });
  it("same four rules and the same ally", () => {
    expect(PactRules.parse(engine.pactRules).map((r) => [r.id, r.action.kind, r.then_label])).toEqual(
      PACT_RULES.demo.map((r) => [r.id, r.action.kind, r.then_label]),
    );
    expect(Settings.parse(engine.settings).ally).toEqual({ name: "Jade", relation: "sister" });
  });
});
