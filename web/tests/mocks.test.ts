import { describe, expect, it, beforeEach } from "vitest";
import { Forecast, Rewind, Settings, PactRule } from "../lib/contracts";
import {
  weatherState,
  oneInN,
  shouldWarn,
  inStormMode,
  heroState,
  coveredDays,
  bufferBand,
  showCalmOffer,
  firstStorm,
} from "../lib/thresholds";
import { FORECASTS, REWINDS, SETTINGS, PACT_RULES, APP_SCENARIOS } from "../mocks/scenarios";
import { mockApi, resetMocks, ApiError } from "../lib/mockApi";

describe("weather thresholds (match engine/forecast.py)", () => {
  it.each([
    [0, "clear"],
    [0.0999, "clear"],
    [0.1, "cloudy"],
    [0.3, "cloudy"],
    [0.3001, "storm"],
    [1, "storm"],
  ] as const)("p=%s -> %s", (p, state) => expect(weatherState(p)).toBe(state));

  it("custom threshold moves the storm line", () => {
    expect(weatherState(0.2, 0.15)).toBe("storm");
    expect(weatherState(0.15, 0.15)).toBe("cloudy");
  });
});

describe("1 in N", () => {
  it.each([
    [0.33, "1 in 3"],
    [0.125, "1 in 8"],
    [0.5, "1 in 2"],
    [0.04, "1 in 25"],
    [0.9, "1 in 2"],
    [0.97, "almost certain"],
  ])("%s -> %s", (p, s) => expect(oneInN(p)).toBe(s));
  it("zero chance is null", () => expect(oneInN(0)).toBeNull());
});

describe("every mock satisfies the contract", () => {
  it.each(Object.entries(FORECASTS))("forecast %s", (_, f) => {
    expect(() => Forecast.parse(f)).not.toThrow();
    for (const d of f.days) for (const id of d.driver_ids) expect(f.drivers.some((x) => x.id === id), `${f.id} ${d.date} ${id}`).toBe(true);
  });
  it.each(Object.entries(REWINDS))("rewind %s", (_, r) => {
    Rewind.parse(r);
    expect(r.months.reduce((a, m) => a + m.extra_gbp, 0)).toBe(r.total_gbp);
  });
  it.each(Object.entries(SETTINGS))("settings %s", (_, s) => void Settings.parse(s));
  it.each(Object.entries(PACT_RULES))("rules %s", (_, rs) => rs.forEach((r) => PactRule.parse(r)));
  it.each(Object.entries(APP_SCENARIOS))("scenario %s references real mocks", (_, sc) => {
    expect(FORECASTS[sc.forecast]).toBeDefined();
    expect(SETTINGS[sc.settings]).toBeDefined();
    expect(REWINDS[sc.rewind]).toBeDefined();
    expect(PACT_RULES[sc.rules]).toBeDefined();
  });
});

describe("demo reproduces the spec figures", () => {
  const f = FORECASTS.demo;
  const byDate = (d: string) => f.days.find((x) => x.date === d)!;
  it("10 to 18 March clear, 19 to 22 tight, 23 storm", () => {
    for (let i = 10; i <= 18; i++) expect(byDate(`2026-03-${String(i).padStart(2, "0")}`).state).toBe("clear");
    for (let i = 19; i <= 22; i++) expect(byDate(`2026-03-${i}`).state).toBe("cloudy");
    expect(byDate("2026-03-23").state).toBe("storm");
    expect(oneInN(byDate("2026-03-23").p_shortfall)).toBe("1 in 3");
    expect(byDate("2026-03-23").p50).toBe(35);
  });
  it("covered until 19 March; best action £15 on 13 March to 1 in 8", () => {
    expect(f.covered_until).toBe("2026-03-19");
    expect(f.best_action).toMatchObject({ action_id: "move_to_buffer", amount_gbp: 15, date: "2026-03-13" });
    expect(oneInN(f.best_action!.p_after)).toBe("1 in 8");
  });
  it("after the buffer move the storm becomes tight", () => {
    expect(firstStorm(FORECASTS.demo_after_buffer)).toBeNull();
  });
  it("rewind totals £214, kept £96", () => {
    expect(REWINDS.demo.total_gbp).toBe(214);
    expect(REWINDS.demo.kept_with_pact_gbp).toBe(96);
  });
});

describe("UI decisions", () => {
  const lead = (n: 14 | 7 | 0) => ({ storm_lead_days: n });
  it("storm lead days", () => {
    expect(shouldWarn(FORECASTS.demo, lead(14))).toBe(true); // 13 days out
    expect(shouldWarn(FORECASTS.demo, lead(7))).toBe(false);
    expect(shouldWarn(FORECASTS.storm_in_7, lead(7))).toBe(true);
    expect(shouldWarn(FORECASTS.storm_in_7, lead(0))).toBe(false);
    expect(shouldWarn(FORECASTS.storm_far, lead(14))).toBe(false);
    expect(shouldWarn(FORECASTS.storm_today, lead(0))).toBe(true);
    expect(shouldWarn(FORECASTS.all_clear, lead(14))).toBe(false);
    expect(shouldWarn(FORECASTS.tight_only, lead(14))).toBe(false);
  });
  it("storm mode only when the storm is today or tomorrow", () => {
    expect(inStormMode(FORECASTS.storm_tomorrow)).toBe(true);
    expect(inStormMode(FORECASTS.storm_today)).toBe(true);
    expect(inStormMode(FORECASTS.demo)).toBe(false);
  });
  it("hero state", () => {
    expect(heroState(FORECASTS.demo, lead(14))).toBe("storm");
    expect(heroState(FORECASTS.demo, lead(7))).toBe("clear");
    expect(heroState(FORECASTS.tight_only, lead(14))).toBe("clear");
  });
  it("buffer bands", () => {
    expect(coveredDays(FORECASTS.demo)).toBe(10);
    expect(coveredDays(FORECASTS.storm_today)).toBe(0);
    expect([0, 3, 7, 14].map(bufferBand)).toEqual(["empty", "low", "ok", "good"]);
  });
  it("calm offer only when worried and not already calm", () => {
    expect(showCalmOffer(SETTINGS.worried)).toBe(true);
    expect(showCalmOffer(SETTINGS.calm_mode_on)).toBe(false);
    expect(showCalmOffer(SETTINGS.default)).toBe(false);
  });
});

describe("mock API", () => {
  beforeEach(() => resetMocks("demo"));
  it("move £15 to buffer swaps the forecast", async () => {
    const after = await mockApi.moveToBuffer(15);
    expect(firstStorm(after)).toBeNull();
  });
  it("settings round-trip and reading level drives explain", async () => {
    await mockApi.putSettings({ reading_level: "detailed" });
    const block = await mockApi.explain("x");
    expect(block.kind).toBe("hero");
    expect((await mockApi.getSettings()).reading_level).toBe("detailed");
  });
  it("parser rejects things outside the five actions", async () => {
    await expect(mockApi.parsePact("Invest everything in crypto")).rejects.toBeInstanceOf(ApiError);
    const [r] = await mockApi.parsePact("Put £15 aside on payday");
    expect(r.action.kind).toBe("move_to_buffer");
  });
  it("failure scenarios throw plain-language errors", async () => {
    resetMocks("forecast_500");
    await expect(mockApi.getForecast()).rejects.toMatchObject({ status: 500 });
    await expect(mockApi.getRewind()).resolves.toBeDefined();
  });
  it("unknown scenario falls back to demo", () => {
    expect(resetMocks("nope").name).toBe("demo");
  });
});
