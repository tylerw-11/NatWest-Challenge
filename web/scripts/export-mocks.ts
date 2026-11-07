// Writes the canonical JSON mocks (web/mocks/*.json) from scenarios.ts,
// so anything that wants plain JSON (Postman, the engine team, Storybook) can use them.
// Run: npm run mocks:export
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { FORECASTS, REWINDS, SETTINGS, PACT_RULES, APP_SCENARIOS } from "../mocks/scenarios";

const out = join(import.meta.dirname, "..", "mocks");
mkdirSync(join(out, "forecast"), { recursive: true });
const write = (p: string, x: unknown) => writeFileSync(join(out, p), JSON.stringify(x, null, 2) + "\n");

write("forecast.json", FORECASTS.demo);
write("rewind.json", REWINDS.demo);
write("settings.json", SETTINGS.demo);
write("pact.json", PACT_RULES.demo);
for (const [k, v] of Object.entries(FORECASTS)) write(`forecast/${k}.json`, v);
write("scenarios.json", APP_SCENARIOS);
console.log("mocks written to", out);
