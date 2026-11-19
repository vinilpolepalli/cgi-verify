// Reimplementation of the PUBLISHED Computable GPU Index aggregation (server-side, pure, no I/O).
//
// Sources read (public, Apache-2.0): https://github.com/getcomputable/gpu-index
//   commit 528b63925b005dd151a5d8600fdb1ea7a37fa2bb (main HEAD when read, committed 2026-09-24)
//   - METHODOLOGY.md  section 7.1 (interquantile mean of standard-deviation votes), 8.6 (carried votes), 12.3
//   - src/gpu_index/index/composite.py: _weighted_quantile, _interquantile_mean, median_stddev_composite
//   - src/gpu_index/published/verify.py: recompute_observation (the receipt-only reproduction we mirror)
// Methodology ids covered: annex_a_v0_2_calc_v17 (B300), annex_a2_v0_3_calc_v17 (B200),
//   h100_sxm_v1_calc_v16, h200_sxm_v1_calc_v16 (page shows them upper-case, e.g. ANNEX_A_V0_2_CALC_V17).
//
// The law (mirrors verify.py, smoothing-armed lane, calc_params.pre_smoothing_half_life_hours present):
//   * voter = receipt with status "ok" AND (filter_verdict "accepted" OR carried_vote_from non-empty string)
//   * each voter casts its published weight three times: at cast-price - sd, cast-price, cast-price + sd,
//     where cast-price = smoothed_vote_usd (NEVER the raw print) and sd = the ROUNDED published receipt sd
//   * index = exact-rational mean of the votes inside the band [1/2 - alpha, 1/2 + alpha] of cumulative vote
//     weight (fractional at the edges), alpha = calc_params.iqm_alpha (0.16666), quantized once to 6 dp (half-even)
//   * band = max(index - p25, p75 - index) over weighted vote quantiles, boundary ties average the neighbours
//   * a composite exists only if (voters - carried voters) >= calc_params.min_sources_to_publish
// Weights/values are read as WRITTEN (shortest decimal repr) into exact rationals, like Python's Fraction(str(x)).
import type { Receipt, SkuData } from "./types";

type Q = { n: bigint; d: bigint }; // exact rational, d > 0
const gcd = (a: bigint, b: bigint): bigint => { a = a < 0n ? -a : a; while (b) [a, b] = [b, a % b]; return a; };
const q = (n: bigint, d: bigint = 1n): Q => { if (d < 0n) { n = -n; d = -d; } const g = gcd(n, d) || 1n; return { n: n / g, d: d / g }; };
const add = (a: Q, b: Q) => q(a.n * b.d + b.n * a.d, a.d * b.d);
const sub = (a: Q, b: Q) => q(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (a: Q, b: Q) => q(a.n * b.n, a.d * b.d);
const div = (a: Q, b: Q) => q(a.n * b.d, a.d * b.n);
const cmp = (a: Q, b: Q) => { const l = a.n * b.d, r = b.n * a.d; return l < r ? -1 : l > r ? 1 : 0; };
const ZERO = q(0n);

/** Exact rational of a JS number as written (String(x)), handling exponent notation. */
export function fromNumber(x: number): Q {
  if (!Number.isFinite(x)) throw new Error("non-finite number");
  const s = String(x);
  const m = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/.exec(s);
  if (!m) throw new Error(`unparseable number ${s}`);
  const frac = m[3] ?? "";
  let n = BigInt(m[2] + frac); if (m[1]) n = -n;
  let e = (m[4] ? parseInt(m[4], 10) : 0) - frac.length;
  return e >= 0 ? q(n * 10n ** BigInt(e)) : q(n, 10n ** BigInt(-e));
}

/** Round exact rational to 6 dp, half-even (Python round() on a Fraction), returned as the nearest double. */
function round6(x: Q): number {
  const scaled = q(x.n * 1_000_000n, x.d);
  let fl = scaled.n / scaled.d; if (scaled.n < 0n && scaled.n % scaled.d !== 0n) fl -= 1n;
  const rem = sub(scaled, q(fl));
  const c = cmp(rem, q(1n, 2n));
  const r = c > 0 || (c === 0 && fl % 2n !== 0n) ? fl + 1n : fl;
  return Number(r) / 1e6;
}
/** Python round(float, 6) equivalent for the band's float arithmetic. */
const round6f = (v: number) => Number(v.toFixed(6));

export type Vote = { value: number; weight: number; provider: string };

function ordered(votes: Vote[]) {
  if (votes.some((v) => v.weight < 0)) throw new Error("negative weight");
  return votes.filter((v) => v.weight > 0).sort((a, b) => a.value - b.value || a.weight - b.weight);
}

/** composite._weighted_quantile: value at cumulative weight q*W; exact tie averages the next vote (float mean). */
export function weightedQuantile(votes: Vote[], qq: Q): number {
  const o = ordered(votes);
  const total = o.reduce((a, v) => add(a, fromNumber(v.weight)), ZERO);
  const target = mul(qq, total);
  let cum = ZERO;
  for (let i = 0; i < o.length; i++) {
    cum = add(cum, fromNumber(o[i].weight));
    const c = cmp(cum, target);
    if (c > 0) return o[i].value;
    if (c === 0) return (o[i].value + o[i + 1].value) / 2;
  }
  throw new Error("weighted quantile of an empty/zero-weight book");
}

/** composite._interquantile_mean over [1/2-alpha, 1/2+alpha], exact; returns the exact rational. */
export function interquantileMean(votes: Vote[], alpha: Q): Q {
  const half = q(1n, 2n);
  if (!(cmp(alpha, ZERO) > 0 && cmp(alpha, half) <= 0)) throw new Error("iqm alpha must be in (0, 1/2]");
  const o = ordered(votes);
  const total = o.reduce((a, v) => add(a, fromNumber(v.weight)), ZERO);
  if (cmp(total, ZERO) === 0) throw new Error("interquantile mean of an empty/zero-weight book");
  const lo = mul(sub(half, alpha), total), hi = mul(add(half, alpha), total);
  let acc = ZERO, cum = ZERO;
  for (const v of o) {
    const prev = cum; cum = add(cum, fromNumber(v.weight));
    const top = cmp(cum, hi) < 0 ? cum : hi, bot = cmp(prev, lo) > 0 ? prev : lo;
    const overlap = sub(top, bot);
    if (cmp(overlap, ZERO) > 0) acc = add(acc, mul(fromNumber(v.value), overlap));
  }
  return div(acc, sub(hi, lo));
}

export type VoteRow = { provider: string; weight: number; cast: number; sd: number; carried: boolean };
export type Composite = { value: number; band: number; p25: number; p75: number; voteMedian: number; totalWeight: number; alpha: number };

/** composite.median_stddev_composite (iqm branch). */
export function composite(rows: VoteRow[], alphaNumber: number): Composite {
  const votes: Vote[] = [];
  for (const r of rows) {
    if (![r.cast, r.sd, r.cast - r.sd, r.cast + r.sd].every(Number.isFinite) || r.sd < 0) throw new Error(`non-finite vote for ${r.provider}`);
    votes.push({ provider: r.provider, weight: r.weight, value: r.cast - r.sd }, { provider: r.provider, weight: r.weight, value: r.cast }, { provider: r.provider, weight: r.weight, value: r.cast + r.sd });
  }
  const alpha = fromNumber(alphaNumber);
  const value = round6(interquantileMean(votes, alpha));
  const p25 = weightedQuantile(votes, q(1n, 4n)), p75 = weightedQuantile(votes, q(3n, 4n));
  const voteMedian = round6f(weightedQuantile(votes, q(1n, 2n)));
  const total = rows.reduce((a, r) => a + r.weight, 0);
  return { value, band: round6f(Math.max(value - p25, p75 - value)), p25: round6f(p25), p75: round6f(p75), voteMedian, totalWeight: total, alpha: alphaNumber };
}

// ------------------------------------------------------------ receipts -> verdict

export type Check =
  | { status: "match"; recomputed: number; recomputedBand: number; rows: VoteRow[]; observed: number; carried: number; detail: string }
  | { status: "divergence"; recomputed: number; recomputedBand: number; rows: VoteRow[]; observed: number; carried: number; detail: string }
  | { status: "missing-input"; rows: VoteRow[]; missing: string[]; detail: string };

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Mirror of verify.recompute_observation for one stored SKU record. Never raw-price fallback. */
export function checkSku(s: SkuData): Check {
  const rows: VoteRow[] = [];
  const missing: string[] = [];
  for (const r of s.receipts) {
    const carried = typeof r.carriedVoteFrom === "string" && r.carriedVoteFrom.length > 0;
    const contributing = r.status === "ok" && (r.verdict === "accepted" || carried);
    if (!contributing) continue;
    if (r.disclosure === "withheld") { missing.push(`${r.provider}: price/sd withheld by the publisher`); continue; }
    if (!num(r.smoothedVote) || r.smoothedVote <= 0) { missing.push(`${r.provider}: smoothed_vote_usd (cast price) not disclosed`); continue; }
    if (!num(r.sd)) { missing.push(`${r.provider}: sd not disclosed`); continue; }
    if (!num(r.weight)) { missing.push(`${r.provider}: weight not disclosed`); continue; }
    rows.push({ provider: r.provider, weight: r.weight, cast: r.smoothedVote, sd: r.sd, carried: carried || r.upstreamStatus === "carried" });
  }
  if (missing.length) return { status: "missing-input", rows, missing, detail: `Cannot re-derive: ${missing.join("; ")}.` };
  const carriedN = rows.filter((x) => x.carried).length;
  const observed = rows.length - carriedN;
  if (observed < s.calc.minSourcesToPublish) {
    return { status: "divergence", recomputed: NaN, recomputedBand: NaN, rows, observed, carried: carriedN, detail: `Only ${observed} observed voters (< min_sources_to_publish ${s.calc.minSourcesToPublish}); the published method would print no index, but a value was published.` };
  }
  const c = composite(rows, s.calc.iqmAlpha);
  const valueOk = c.value === s.publishedIndex;
  const bandOk = s.publishedBand == null || c.band === s.publishedBand;
  const tol = Math.abs(c.value - s.publishedIndex) <= 5e-7 && (s.publishedBand == null || Math.abs(c.band - s.publishedBand) <= 5e-7);
  if (valueOk && bandOk) return { status: "match", recomputed: c.value, recomputedBand: c.band, rows, observed, carried: carriedN, detail: "Exact match at the published 6-decimal precision (value and stability band)." };
  if (tol) return { status: "match", recomputed: c.value, recomputedBand: c.band, rows, observed, carried: carriedN, detail: "Match within 5e-7 (float rounding at the 6th decimal)." };
  return { status: "divergence", recomputed: c.value, recomputedBand: c.band, rows, observed, carried: carriedN,
    detail: `Numeric divergence with all inputs present: recomputed ${c.value} vs published ${s.publishedIndex}${s.publishedBand != null ? ` (band ${c.band} vs ${s.publishedBand})` : ""}.` };
}

export type SkuResult = {
  sku: string; published: number; publishedBand: number | null; status: Check["status"]; pass: boolean;
  recomputed: number | null; recomputedBand: number | null; diff: number | null; diffPct: number | null;
  voters: number; carried: number; detail: string; calcSource: "published" | "assumed";
};
export function resultFor(s: SkuData): SkuResult {
  const c = checkSku(s);
  const rec = c.status === "missing-input" ? null : c.recomputed;
  const finite = rec != null && Number.isFinite(rec);
  return {
    sku: s.id, published: s.publishedIndex, publishedBand: s.publishedBand ?? null, status: c.status, pass: c.status === "match",
    recomputed: finite ? rec : null, recomputedBand: c.status === "missing-input" || !finite ? null : c.recomputedBand,
    diff: finite ? rec! - s.publishedIndex : null, diffPct: finite ? ((rec! / s.publishedIndex) - 1) * 100 : null,
    voters: c.rows.length, carried: c.status === "missing-input" ? 0 : c.carried, detail: c.detail, calcSource: s.calc.source,
  };
}
export type { Receipt };
