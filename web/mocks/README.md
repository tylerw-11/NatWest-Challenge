# Frontend mocks and thresholds

Dummy data for every use case we know of, so screens can be built and tested before the engine is wired in.

| File | What |
| --- | --- |
| `lib/contracts.ts` | Zod schemas mirroring `engine/contracts.py` (from the `tyler` branch) |
| `lib/thresholds.ts` | Every UI threshold: clear/tight/storm, "1 in N", storm lead days, Storm mode, buffer bands, calm offer, 48 h delay |
| `mocks/scenarios.ts` | Source of truth for all dummy data and the named app scenarios |
| `lib/mockApi.ts` | In-memory fake engine with the same endpoints; latency and error injection |
| `mocks/*.json` | Plain JSON exports (`npm run mocks:export`) |
| `tests/mocks.test.ts` | Threshold edges, spec demo figures, contract validity, mock API behaviour |

## Thresholds (same as the engine)

| p_shortfall | state | UI word |
| --- | --- | --- |
| < 0.10 | `clear` | fine |
| 0.10 to `storm_threshold` (default 0.30, inclusive) | `cloudy` | tight |
| > `storm_threshold` | `storm` | storm |

- "1 in N" = `round(1 / p)`, at least 2; 0 → no chance shown; ≥ 0.95 → "almost certain".
- Storm card / warning: first storm within `storm_lead_days` (14, 7, or 0 = on the day only).
- Storm mode: the storm is today or tomorrow.
- Safety buffer tile: 0 days empty, under 7 low, under 14 ok, 14 or more good.
- Support: mood `worried` and calm mode off → show the calm mode offer.
- The UI shows the engine's `state`; it never recomputes it (see the `boundaries_sensitive` scenario).

## Pick a scenario

Add `?scenario=<name>` to any URL, or set `NEXT_PUBLIC_MOCK_SCENARIO=<name>`. Unknown names fall back to `demo`.

`demo`, `demo_after_buffer`, `all_clear`, `tight_only`, `storm_mode`, `storm_today`, `storm_far_lead14`, `storm_in_7_lead7`, `storm_in_7_lead0`, `two_storms`, `boundaries`, `boundaries_sensitive`, `all_driver_kinds`, `storm_no_drivers`, `short_horizon`, `wealthy`, `new_user`, `drafts`, `pending_change`, `worried`, `calm_mode`, `detailed`, `translated_rtl`, `colour_blind`, `high_contrast`, `bank_disconnected`, `slow`, `offline`, `forecast_500`, `explain_fails`, `parse_rejects`, `logged_out`

Each scenario's one-line note is in `APP_SCENARIOS`, and `listScenarios()` returns them for a `/dev/scenarios` picker.

## Use in a screen

```ts
import { mockApi } from "@/lib/mockApi";
const forecast = await mockApi.getForecast(); // Zod-validated Forecast
```

`web/lib/api.ts` should export the same function names, so `USE_MOCKS=true` can swap between them.

## Run

```bash
cd web && npm install && npm test
```

When the Next.js app is scaffolded into `web/`, merge this `package.json` into it (zod, vitest, tsx, @types/node).
