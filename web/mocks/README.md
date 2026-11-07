# Scenario mocks and thresholds

An add-on to Roh's foundation (FE-01) for testing every use case before the engine is wired. It changes none of Roh's files; it only adds new ones.

| File | What |
| --- | --- |
| `mocks/scenarios.ts` | 31 named scenarios. `demo` **is** `forecast.json`, `rewind.json` and `settings.json`; the rest are variations |
| `lib/thresholds.ts` | Threshold decisions: weather rule, storm warning lead time, Storm mode, buffer band, calm offer. Wording stays in `lib/format.ts` |
| `lib/mockApi.ts` | Scenario-aware fake engine. `forecast`, `rewind` and `settings` match `api` in `lib/api.ts`; it adds `me`, `pact`, `parsePact`, `explain`, `moveToBuffer`… with latency and error injection |
| `app/dev/scenarios/page.tsx` | The switcher |
| `/web-tests` (repo root) | 91 checks. Kept outside `web/` so `web/package.json` stays Roh's |

## Use it

```bash
cd web && npm install && npm run dev      # http://localhost:3000/dev/scenarios
cd web-tests && npm install && npm test   # needs web/node_modules for zod
```

Scenario order: `?scenario=<name>` in any URL, then the one picked on `/dev/scenarios` (saved in your browser), then `NEXT_PUBLIC_MOCK_SCENARIO`, then `demo`.

## Thresholds (same as the engine)

| p_shortfall | engine `state` | UI word |
| --- | --- | --- |
| under 0.10 | `clear` | fine |
| 0.10 to `storm_threshold` (0.30, inclusive) | `cloudy` | tight |
| over `storm_threshold` | `storm` | storm |

Still to confirm with the team (see `docs/decisions/0001-data-contract.md`):
- Storm mode takes over when the storm is today or tomorrow.
- Buffer band: 0 empty, under 7 low, under 14 ok, 14+ good.
- Calm offer: shown when mood is `worried` and calm mode is off.

## Scenarios

| Group | Names |
| --- | --- |
| Demo path | `demo`, `demo_after_buffer`, `storm_mode` |
| Weather states | `all_clear`, `tight_only`, `storm_today`, `two_storms` |
| Warning lead time | `storm_far`, `storm_in_7_lead7`, `storm_in_7_lead0` |
| Threshold edges | `boundaries`, `boundaries_sensitive` |
| Data edge cases | `all_driver_kinds`, `storm_no_drivers`, `wealthy` |
| People and settings | `new_user`, `worried`, `calm_mode`, `detailed`, `translated_rtl`, `colour_blind`, `high_contrast`, `bank_disconnected` |
| Pact rules | `drafts`, `no_rules`, `parse_rejects` |
| Loading and errors | `slow`, `offline`, `forecast_500`, `explain_fails`, `logged_out` |
