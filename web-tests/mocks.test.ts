import { beforeEach, describe, expect, it } from "vitest";
import { Forecast, PactRule, Rewind, Settings, UIBlock } from "@/lib/contracts";
import { oneInN, stateLabel } from "@/lib/format";
import {
  bufferBand,
  coveredDays,
  firstStorm,
  inStormMode,
  shouldWarn,
  showCalmOffer,
  weatherState,
} from "@/lib/thresholds";
import { APP_SCENARIOS, EXPLAIN, FORECASTS, PACT_RULES, REWINDS, SETTINGS } from "@/mocks/scenarios";
import { mockApi, resetMocks } from "@/lib/mockApi";
import { ApiError } from "@/lib/api";

describe("weather rule matches the engine (clear < 0.10 <= cloudy <= threshold < storm)", () => {
  it.each([
    [0, "clear"],
    [0.0999, "clear"],
    [0.1, "cloudy"],
    [0.3, "cloudy"],
    [0.3001, "storm"],
    [1, "storm"],
  ] as const)("p=%s -> %s", (p, s) => expect(weatherState(p)).toBe(s));

  it("a custom threshold moves the storm line", () => {
    expect(weatherState(0.2, 0.15)).toBe("storm");
    expect(weatherState(0.15, 0.15)).toBe("cloudy");
  });

  it("every mock day's state follows the rule at the default threshold", () => {
    for (const f of Object.values(FORECASTS))
      for (const d of f.days) expect(d.state, `${f.id} ${d.date}`).toBe(weatherState(d.p_shortfall));
  });
});

describe("every mock passes Roh's contracts", () => {
  it.each(Object.entries(FORECASTS))("forecast %s", (_, f) => {
    expect(() => Forecast.parse(f)).not.toThrow();
    for (const d of f.days)
      for (const id of d.driver_ids) expect(f.drivers.some((x) => x.id === id), `${f.id} ${d.date} ${id}`).toBe(true);
  });
  it.each(Object.entries(REWINDS))("rewind %s adds up", (_, r) => {
    Rewind.parse(r);
    expect(r.months.reduce((a, m) => a + m.extra_gbp, 0)).toBe(r.total_gbp);
  });
  it.each(Object.entries(SETTINGS))("settings %s", (_, s) => void Settings.parse(s));
  it.each(Object.entries(PACT_RULES))("rules %s", (_, rs) => void PactRule.array().parse(rs));
  it.each(Object.entries(EXPLAIN))("explain %s", (_, b) => void UIBlock.parse(b));
  it.each(Object.entries(APP_SCENARIOS))("scenario %s points at real mocks", (_, sc) => {
    expect(FORECASTS[sc.forecast]).toBeDefined();
    expect(SETTINGS[sc.settings]).toBeDefined();
    expect(REWINDS[sc.rewind]).toBeDefined();
    expect(PACT_RULES[sc.rules]).toBeDefined();
  });
});

describe("demo is the spec's figures", () => {
  const f = FORECASTS.demo;
  const on = (date: string) => f.days.find((x) => x.date === date)!;
  it("fine 10-18, tight 19-22, storm 23 March at 1 in 3 with £35 most likely", () => {
    for (let i = 10; i <= 18; i++) expect(on(`2026-03-${String(i).padStart(2, "0")}`).state).toBe("clear");
    for (let i = 19; i <= 22; i++) expect(on(`2026-03-${i}`).state).toBe("cloudy");
    expect(on("2026-03-23").state).toBe("storm");
    expect(oneInN(on("2026-03-23").p_shortfall)).toBe("1 in 3");
    expect(on("2026-03-23").p50).toBe(35);
  });
  it("covered until 19 March; £15 on 13 March makes it 1 in 8", () => {
    expect(f.covered_until).toBe("2026-03-19");
    expect(f.best_action).toMatchObject({ action_id: "move_to_buffer", amount_gbp: 15, date: "2026-03-13" });
    expect(oneInN(f.best_action.p_after)).toBe("1 in 8");
  });
  it("after the move, 23 March reads tight (demo step 7)", () => {
    expect(firstStorm(FORECASTS.demo_after_buffer)).toBeNull();
    expect(stateLabel(FORECASTS.demo_after_buffer.days.find((d) => d.date === "2026-03-23")!.state)).toBe("tight");
  });
  it("rewind £214 extra, about £96 kept", () => {
    expect(REWINDS.demo.total_gbp).toBe(214);
    expect(REWINDS.demo.kept_with_pact_gbp).toBe(96);
  });
});

describe("screen decisions", () => {
  const lead = (n: 14 | 7 | 0) => ({ storm_lead_days: n });
  it("storm warning respects the lead time", () => {
    expect(shouldWarn(FORECASTS.demo, lead(14))).toBe(true); // 13 days out
    expect(shouldWarn(FORECASTS.demo, lead(7))).toBe(false);
    expect(shouldWarn(FORECASTS.storm_in_7, lead(7))).toBe(true);
    expect(shouldWarn(FORECASTS.storm_in_7, lead(0))).toBe(false);
    expect(shouldWarn(FORECASTS.storm_far, lead(14))).toBe(false);
    expect(shouldWarn(FORECASTS.storm_today, lead(0))).toBe(true);
    expect(shouldWarn(FORECASTS.all_clear, lead(14))).toBe(false);
    expect(shouldWarn(FORECASTS.tight_only, lead(14))).toBe(false);
  });
  it("Storm mode only when the storm is today or tomorrow", () => {
    expect(inStormMode(FORECASTS.storm_tomorrow)).toBe(true);
    expect(inStormMode(FORECASTS.storm_today)).toBe(true);
    expect(inStormMode(FORECASTS.demo)).toBe(false);
  });
  it("buffer bands", () => {
    expect(coveredDays(FORECASTS.demo)).toBe(10);
    expect(coveredDays(FORECASTS.storm_today)).toBe(0);
    expect([0, 3, 7, 14].map(bufferBand)).toEqual(["empty", "low", "ok", "good"]);
  });
  it("calm offer only when worried and calm mode is off", () => {
    expect(showCalmOffer(SETTINGS.worried)).toBe(true);
    expect(showCalmOffer(SETTINGS.calm_mode_on)).toBe(false);
    expect(showCalmOffer(SETTINGS.demo)).toBe(false);
  });
});

describe("mockApi", () => {
  beforeEach(() => void resetMocks("demo"));

  it("has the same calls as api.ts", async () => {
    expect((await mockApi.forecast()).id).toBe(FORECASTS.demo.id);
    expect((await mockApi.rewind()).total_gbp).toBe(214);
    expect((await mockApi.settings()).ally?.name).toBe("Jade");
  });
  it("moving £15 turns the storm tight", async () => {
    expect(firstStorm(await mockApi.moveToBuffer(15))).toBeNull();
  });
  it("reading level picks the explanation", async () => {
    await mockApi.putSettings({ reading_level: "detailed" });
    const b = await mockApi.explain();
    expect(b.kind === "hero" && b.headline).toContain("1 in 3");
  });
  it("the parser only accepts the five actions", async () => {
    await expect(mockApi.parsePact("Invest everything in crypto")).rejects.toBeInstanceOf(ApiError);
    const [r] = await mockApi.parsePact("Put £15 aside on payday");
    expect(r.action.kind).toBe("move_to_buffer");
    expect(r.confirmed).toBe(false);
  });
  it("failure scenarios throw plain-language errors on the right calls only", async () => {
    resetMocks("forecast_500");
    await expect(mockApi.forecast()).rejects.toMatchObject({ code: "server_error" });
    await expect(mockApi.rewind()).resolves.toBeDefined();
  });
  it("an unknown scenario falls back to demo", () => {
    expect(resetMocks("nope").name).toBe("demo");
  });
});
