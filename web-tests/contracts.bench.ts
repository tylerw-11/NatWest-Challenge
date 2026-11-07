// Frontend hot paths: Zod-parsing a 60-day forecast (every screen does this on load),
// building the scenario list, and the threshold decisions. `npm run bench`; results in docs/benchmarks.md.
import { bench, describe } from "vitest";
import { Forecast } from "@/lib/contracts";
import { inStormMode, shouldWarn, weatherState } from "@/lib/thresholds";
import { FORECASTS, SETTINGS } from "@/mocks/scenarios";
import { resetMocks } from "@/lib/mockApi";

const demo = JSON.parse(JSON.stringify(FORECASTS.demo));

describe("frontend", () => {
  bench("Forecast.parse (60 days, 3 drivers)", () => {
    Forecast.parse(demo);
  });
  bench("threshold decisions for one forecast", () => {
    for (const d of demo.days) weatherState(d.p_shortfall);
    shouldWarn(FORECASTS.demo, SETTINGS.demo);
    inStormMode(FORECASTS.demo);
  });
  bench("resetMocks + parse the two-storm forecast", () => {
    resetMocks("demo");
    Forecast.parse(JSON.parse(JSON.stringify(FORECASTS.two_storms)));
  });
});
