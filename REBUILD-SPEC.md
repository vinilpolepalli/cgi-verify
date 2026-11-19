# CGI Verify v2 - high-fidelity rebuild spec

Rebuild this static demo into a real working product with a live backend. Maps to Computable (getcomputable.com, YC S26): the first exchange for physical compute; they publish the Computable GPU Index (CGI) at market.getcomputable.com, an open, verifiable price index for GPU compute. CGI Verify is the independent verification companion the index invites: fetch the live published inputs, recompute the index yourself, audit the math, stress-test it, and keep a history of verifications.

Do not deploy, do not git commit, do not push. No paid services or API keys.

## Architecture
- Next.js App Router + TypeScript + Tailwind, SERVER runtime (remove output:'export' and the committed-snapshot flow).
- Drizzle ORM: SQLite file (cgiverify.db) dev; Postgres via DATABASE_URL prod.
- Data source: https://market.getcomputable.com only (public page, no key). Server-side fetch + parse of the Next.js flight payload (the current scripts/fetch-snapshot.mjs logic is proven - port it into lib/sec-style server module lib/computable.ts). STRICT validation preserved: per-provider price/smoothed vote/stability band/liveness weight/missing markers, published index, daily series, high/low, cross-checks (weights sum to 1, B300 table visible, headline prices). If parsing or validation fails, the fetch FAILS CLOSED: store nothing, show the failure honestly. Never invent or interpolate prices.
- Cache: re-viewing a stored snapshot costs zero fetches. "Fetch now" is always explicit, rate-limited, and throttled (serialize; one retry after 2s).

## Product workflow (fitted to THIS product)
1. Home = verification log: table of past fetches (capturedAt UTC, SKUs covered, recomputed vs published index diff per SKU, pass/flag chip). Empty state: two-sentence explainer + the Fetch button. First action above the fold on mobile.
2. "Fetch and verify now": POST /api/snapshots. Server fetches, validates, recomputes each SKU's index from the published inputs, stores snapshot + recompute results, returns the diff summary. Failure states explicit (site changed shape, validation failed, network) - shown, never swallowed.
3. Snapshot detail page per fetch:
   - Header: capturedAt UTC, source URL, snapshot age ("fetched X ago", LIVE chip only under 15 min), SKU tabs (B300, B200, H100 SXM, H200 SXM as published).
   - Recompute panel: published index vs recomputed per SKU, with the per-provider contribution math expanded (price x liveness weight, normalized over live providers). State the aggregation assumption used (weighted mean/median per what the page documents) and SAY which; if uncertain show both and flag the difference.
   - Provider table: prices, stability bands, liveness weights, missing markers, contribution bars (plain SVG).
   - Stress test: scenario panel - kill a provider (MISSING), inject an outlier price (choose multiple) - run server-side deterministically from the stored snapshot (POST /api/snapshots/:id/scenarios), results show index response per SKU, honestly including sensitivity if the index moves. Scenarios saved per owner, listed, deletable.
   - Methodology and provenance: what was parsed, what was assumed, what could not be verified (stays unknown, never fallback).
4. Compare two snapshots: pick any two fetches, show index and provider-price deltas. Simple table, no chart lib.

## Truthfulness bar
- Every displayed price/weight traces to a stored snapshot with capturedAt and source URL; the UI always shows snapshot age. A fetch timestamp is not data fidelity - recompute and validation results are what get pass/flag chips.
- If the published methodology has steps not visible in the payload, say so and mark those steps assumed. No silent gap-filling.
- Footer: "Demo built by Vinil Polepalli - data: market.getcomputable.com snapshot (timestamp shown). Independent demo; not affiliated with or endorsed by Computable. Not price advice."

## Abuse and isolation controls
- Owner cookie (cgi_uid, httpOnly); libraries/scenarios owner-scoped; cross-owner 403/404.
- Rate limits per owner: 6 fetches/hour, 60 scenario runs/hour, 413 at 20KB, 25-snapshot cap (oldest pruned with notice in IMPLEMENTATION.md). Ticker-like inputs validated before any fetch.

## UI bar
- Light theme, near-white ground, hairlines, small-caps labels, tabular nums, system font stack; mono only for math/payload views.
- Brand accent: deep bronze #b45309 (hover #92400e). Deliberate: market-terminal character for an index-verification tool, outside the indigo/violet band, not the cream/serif/sage swap, and distinct from sibling demos' navy/teal. Comment the rationale in tailwind.config.ts.
- Pills only for status chips; buttons 8px, cards 10px, inputs 8px; no gradients, no emoji icons, no hero+3-cards, no amber-50 fills.
- Layout fitted to an audit tool: log table, dense detail with SKU tabs and expandable math rows. Not a clone of Governance Lens or Context Pack layouts. Mobile: stacked, tables become rows.

## Definition of done
- npm run build passes; typecheck clean.
- Real end-to-end: run the server, fetch a live snapshot through the API, recompute matches or flags honestly, kill-provider and outlier scenarios return deterministic results, owner isolation (fresh cookie = empty log), rate limit 429 after cap.
- Independent spot check: one provider price and the published index in the stored snapshot match what market.getcomputable.com serves right now.
- python3 ~/unslop/devibe_scan.py . - zero high findings or justified unslop-ignore comments.
- README.md (architecture, run, methodology/honesty notes preserved from the current README - it was carefully written) + IMPLEMENTATION.md (data model, endpoints, verification results).
- Screenshots to /tmp: cgi2-log.png, cgi2-detail.png, cgi2-mobile.png (390px) from the RUNNING app.
