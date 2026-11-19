# Implementation notes

## Data model (Drizzle, SQLite/Postgres)
- `snapshots(id, owner_id, captured_at, source_url, data JSON, results JSON, verdict)`: `data` is the full validated parse (schema 2; page-era rows are upgraded on read); `results`/`verdict` are recomputed from `data` with the current engine on every read.
- `scenarios(id, snapshot_id, owner_id, name, params JSON, result JSON, created_at)`.
- `events(id, owner_id, kind, at)`: sliding-window rate limiting (survives restarts).

## Endpoints (all owner-scoped via `cgi_uid`; other owners get 404)
- `POST /api/snapshots`: rate-limited fetch, validate, recompute, store. 201 summary; 429 (+Retry-After); 502 `{kind: network|shape|validation, stored:false}`.
- `GET /api/snapshots`, `GET|DELETE /api/snapshots/:id`.
- `POST|GET /api/snapshots/:id/scenarios`, `DELETE /api/snapshots/:id/scenarios/:sid`. Body `{kill:[provider], outliers:[{provider, multiplier 0.1-10}], name?}`.
- Pages: `/` log, `/s/:id?sku=` detail, `/compare?a=&b=`.

## Limits
6 fetches/hour/owner, 60 scenario runs/hour/owner, 413 over 20KB, provider names validated against `[a-z0-9_-]{1,40}` before anything runs.
Fetches are serialized with 1s spacing and one retry after 2s on network errors.
**Pruning notice:** each owner keeps at most 25 snapshots; the oldest (and its scenarios) are deleted automatically when a new one is stored.

## Data path
Corpus `latest.json` (digest-verified, fail closed: shape / validation / network) then four per-SKU REST calls as a cross-check, all serialized with 1s spacing and one retry after 2s; 5 MB body cap, HTTPS only. Per SKU the latest observation must be unique at its stamp and carry the live methodology id.

## Verification results (2026-11-17)
- `tsc --noEmit` and `npm run build` pass.
- Fresh fetch (HTTP 201): corpus digest verified; B300 10.113407 / band 4.225764, B200 8.143033 / 0.986951, H100 3.693255 / 0.961758, H200 4.647042 / 1.250662. The re-derivation equals the published value AND band exactly on all four SKUs (pass). REST cross-check: match on all four. Python reference (Fractions, per verify.py) agreed to the digit.
- Stored page-era snapshot re-derived with the same engine: exact match on all four (B300 10.1139, B200 8.140956, H100 3.695521, H200 4.633363), labelled assumed-alpha.
- Fail-closed: tampered value -> digest failure; wrong license, missing envelope, HTML body -> rejected, nothing stored.
- Scenario (kill runpod, vast x3): deterministic; B300 prints no index (4 observed voters < 5), B200 +2.32%.
- Rate limit: an owner at its 6 fetches/hour limit gets 429 + Retry-After; fresh owner sees an empty log; cross-owner detail = 404.
- Known gap: the advertised `https://api.getcomputable.com/v1/index/` root path returns 404; the working endpoints are `/v1/index/{SKU}/latest` and `/history`.
- Inputs not independently re-derived (taken as published): liveness weights, EWMA cast prices, outlier fence, per-provider sd.
