# Scenario mocks and thresholds

Test data for every use case, on top of Roh's demo mocks. With `USE_MOCKS=true` (the default), the app runs Roh's staged demo (`lib/mock-store.ts`; Shift+F fast-forwards, Shift+R resets). Pick any other scenario on `/dev/scenarios` and `lib/api.ts` serves the five read calls from `lib/mockApi.ts` instead, so the real screens show it.

| File | What |
| --- | --- |
| `mocks/scenarios.ts` | 34 named scenarios. `demo` **is** Roh's `forecast.json`, `rewind.json`, `settings.json`, `me.json` and `pact.json`; the rest are variations |
| `lib/thresholds.ts` | Threshold decisions: weather rule, storm warning lead time, Storm mode, buffer band, calm offer. Wording stays in `lib/format.ts` |
| `lib/mockApi.ts` | Scenario-aware fake engine behind `api` in mock mode. It also has `parsePact`, `explain` and `moveToBuffer`, plus latency and error injection |
| `lib/errors.ts` | `ApiError` (plain-language errors), shared by `api.ts` and `mockApi.ts` |
| `app/dev/scenarios/page.tsx` | The switcher |
| `/web-tests` (repo root) | 112 checks, including the engine's real responses against `lib/contracts.ts`, plus `npm run bench`. Kept outside `web/` so `web/package.json` stays the app's |

## Use it

```bash
cd web && npm install && npm run dev      # http://localhost:3000/dev/scenarios
cd web-tests && npm install && npm test   # needs web/node_modules for zod
```

Scenario order: `?scenario=<name>` in any URL, then the one picked on `/dev/scenarios` (saved in your browser), then `NEXT_PUBLIC_MOCK_SCENARIO`, then `demo`. Press **Demo** on `/dev/scenarios` before recording, so a saved test scenario doesn't show up in the video.

## Thresholds (same as the engine)

| p_shortfall | engine `state` | UI word |
| --- | --- | --- |
| under 0.10 | `clear` | fine |
| 0.10 to `storm_threshold` (0.30, inclusive) | `cloudy` | tight |
| over `storm_threshold` | `storm` | storm |

Still to confirm with the team (see `docs/decisions/0001-data-contract.md`, item 4):
- Storm mode takes over when the storm is today or tomorrow.
- Buffer band: 0 empty, under 7 low, under 14 ok, 14+ good.
- Calm offer: shown when mood is `worried` and calm mode is off.

## Scenarios

| Group | Names |
| --- | --- |
| Demo path | `demo`, `rules_agreed`, `demo_fast_forward`, `demo_after_buffer`, `storm_mode` |
| Weather states | `all_clear`, `tight_only`, `storm_today`, `two_storms` |
| Warning lead time | `storm_far`, `storm_in_7_lead7`, `storm_in_7_lead0` |
| Threshold edges | `boundaries`, `boundaries_sensitive` |
| Data edge cases | `all_driver_kinds`, `storm_no_drivers`, `wealthy` |
| People and settings | `new_user`, `worried`, `calm_mode`, `detailed`, `translated_rtl`, `colour_blind`, `high_contrast`, `bank_disconnected` |
| Pact rules | `drafts`, `no_rules`, `pending_change`, `parse_rejects` |
| Loading and errors | `slow`, `offline`, `forecast_500`, `explain_fails`, `logged_out` |
