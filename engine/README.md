# engine

FastAPI backend for Pact. Task T1 scaffolds this folder; tasks T2 to T11 and T16 fill it in (see the Backend requirements tab of the project doc).

Planned layout:

```
main.py          FastAPI app and routers
contracts.py     Pydantic models (mirror of web/lib/contracts.ts)
generator.py     seeded synthetic data for Amara
forecast.py      engine algorithms
routers/         auth, forecast, pact, rewind, settings, ally, account, explain
prompts/         explain.md, parse_pact.md
tests/           generator, forecast, pact_phrasings.json
requirements.txt
```
