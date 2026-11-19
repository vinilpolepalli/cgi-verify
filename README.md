# CGI Verify

Independent verification companion for the [Computable GPU Index (CGI)](https://market.getcomputable.com).
It fetches the official published record (per-provider receipts, weights, parameters), re-derives each SKU's index server-side with the
**published** CGI method, shows the vote-by-vote math, stress-tests it (kill a provider, inject outlier prices) and keeps a per-owner log.

Independent demo; not affiliated with or endorsed by Computable. Not price advice.

## Architecture

- Next.js 15 App Router + TypeScript + Tailwind, server runtime (no static export, no committed snapshot).
- Drizzle ORM: SQLite file `cgiverify.db` in dev; Postgres when `DATABASE_URL` is set (`lib/schema.pg.ts` mirrors `lib/schema.sqlite.ts`; tables are created on first connect).
- `lib/computable.ts`: server-side fetch + strict fail-closed validation of the official corpus (`data.getcomputable.com/latest.json`, envelope digest verified) with a REST cross-check (`api.getcomputable.com/v1/index/{SKU}/latest?include=receipts`). No keys, no paid services.
- `lib/method.ts`: the published method (exact rational interquantile mean); `lib/scenarios.ts`: stress tests on it. Pure and deterministic. `lib/db.ts`: persistence, owner scoping, rate-limit events.
- `middleware.ts`: assigns the httpOnly `cgi_uid` owner cookie. Everything stored is owner-scoped.

## Run

```bash
npm install
npm run build && npm start     # http://localhost:3000
npm run dev                    # dev server
npm run typecheck
DATABASE_URL=postgres://... npm start   # Postgres instead of SQLite
```

Press "Fetch and verify now" on the home page (or `POST /api/snapshots`). Viewing stored snapshots never fetches.

## Methodology grounding

- Method: Computable GPU Index methodology, https://github.com/getcomputable/gpu-index (Apache-2.0), read at commit
  `528b63925b005dd151a5d8600fdb1ea7a37fa2bb` (2026-09-24). Methodology ids: `annex_a_v0_2_calc_v17` (B300), `annex_a2_v0_3_calc_v17` (B200),
  `h100_sxm_v1_calc_v16`, `h200_sxm_v1_calc_v16`. Sources read: METHODOLOGY.md (7.1, 8.6, 12.3), `index/composite.py`
  (`_weighted_quantile`, `_interquantile_mean`, `median_stddev_composite`), `published/verify.py` (receipt-only reproduction). Read, never executed.
- Law implemented: each voting receipt (status ok and filter verdict accepted, or a carried-vote marker) casts its published weight at
  `smoothed_vote_usd - sd`, `smoothed_vote_usd`, `smoothed_vote_usd + sd` (never the raw print). Index = exact-rational mean of the votes inside
  the cumulative-weight band [1/2 - alpha, 1/2 + alpha], `alpha = calc_params.iqm_alpha = 0.16666`, quantized once to 6 dp; stability band =
  max(index - p25, p75 - index). No index if observed (non-carried) voters < `min_sources_to_publish`.
- Data path: the **official corpus** is primary because it supplies every re-derivation input including `calc_params`, and its `artifact_sha256`
  is recomputed and checked. The REST API returns the same receipts but no `calc_params`, so it is a cross-check only (recorded match / differs /
  unavailable / other-observation; it never blocks a snapshot). The market.getcomputable.com page scrape is **dropped**: a subset of the same
  fields with no parameters or digest. Corpus data is CC-BY-NC-4.0; attribution is in the footer.
- Pass / flag: **pass** = our reimplementation reproduces the published value and stability band from the published inputs (exact at 6 dp).
  **flag** = it does not, with the precise reason: *missing input* (names the receipt field the record does not disclose, e.g. withheld or
  no `smoothed_vote_usd`) or *numeric divergence* (all inputs present, numbers differ). Neutral framing is kept: a flag reports facts and the exact
  inputs used; it is not an accusation and may equally be a limit of this reimplementation.
- Taken as published, not re-derived: liveness weights, the 1-hour EWMA behind cast prices, the outlier fence and per-provider sd (they need the
  90-day price history). Stress tests keep weights and sd as published. Page-era snapshots lack `calc_params`/carried markers: they are re-derived
  with `iqm_alpha = 0.16666` (the value the corpus discloses for the same method id) and the page's per-provider band as sd, labelled "assumed".
- Exploratory candidate estimators (mean / medians) were retired from the verification path.
- `npx tsx scripts/selftest.ts <latest.json> [api-dir]` and `npx tsx scripts/failclosed.ts <latest.json>` run offline checks.
- Footer attribution and not-affiliated notice are on every page.
