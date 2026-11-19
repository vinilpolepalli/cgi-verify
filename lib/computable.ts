// Server-side fetch of the OFFICIAL published record (replaces the earlier page flight-payload scrape).
//   primary : https://data.getcomputable.com/latest.json  (flat-file corpus; carries receipts incl. smoothed votes, sd, weights,
//             attendance, and calc_params incl. iqm_alpha; envelope digest artifact_sha256 is verified here)
//   cross-check: https://api.getcomputable.com/v1/index/{SKU}/latest?include=receipts  (REST; same receipts, no calc_params)
// The market.getcomputable.com page scrape is dropped: it carried a subset of the same fields and no calc_params/digest.
// Strict fail-closed validation on the corpus; the API cross-check never blocks a snapshot, it is recorded as match/differs/unavailable.
// Politeness: all outbound requests are serialized with 1s spacing and one retry after 2s. Corpus license CC-BY-NC-4.0 (attribution in footer).
import { createHash } from "node:crypto";
import type { ApiCheck, CalcParams, Receipt, SkuData, SnapshotData } from "./types";
import { SKU_CODE, SKU_LABEL, SKU_ORDER } from "./types";

export const SOURCE_URL = "https://data.getcomputable.com/latest.json";
const API_BASE = "https://api.getcomputable.com/v1/index";
const MAX_BYTES = 5 * 1024 * 1024;

export type FailKind = "network" | "shape" | "validation";
export class FetchError extends Error {
  constructor(public kind: FailKind, message: string) { super(message); }
}
const shape = (m: string) => new FetchError("shape", m);
const invalid = (m: string) => new FetchError("validation", m);

// ---- serialized, polite HTTP
let chain: Promise<unknown> = Promise.resolve();
let lastEnd = 0;
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = async () => {
    const wait = lastEnd + 1000 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    try { return await fn(); } finally { lastEnd = Date.now(); }
  };
  const p = chain.then(run, run);
  chain = p.catch(() => undefined);
  return p;
}
async function getText(url: string): Promise<string> {
  if (!url.startsWith("https://")) throw new FetchError("network", "refusing non-HTTPS url");
  let lastErr = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 2000)); // one retry after 2s
    try {
      const res = await fetch(url, { headers: { "user-agent": "cgi-verify/0.3 (independent verification tool)", accept: "application/json" }, signal: AbortSignal.timeout(20000), cache: "no-store" });
      if (!res.ok) { lastErr = `HTTP ${res.status}`; continue; }
      const len = Number(res.headers.get("content-length") ?? 0);
      if (len > MAX_BYTES) throw new FetchError("shape", "response too large");
      const text = await res.text();
      if (text.length > MAX_BYTES) throw new FetchError("shape", "response too large");
      return text;
    } catch (e) { if (e instanceof FetchError && e.kind === "shape") throw e; lastErr = e instanceof Error ? e.message : String(e); }
  }
  throw new FetchError("network", `could not fetch ${url}: ${lastErr}`);
}

// ---- digest: sha256 over compact canonical JSON (sorted keys) of {data, meta, license}  (gpu_index/published/artifacts.py)
export function sortJson(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortJson);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, sortJson((v as any)[k])]));
  return v;
}
export const payloadDigest = (doc: { data: unknown; meta: unknown; license: unknown }) =>
  createHash("sha256").update(JSON.stringify(sortJson({ data: doc.data, meta: doc.meta, license: doc.license }))).digest("hex");

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const PROVIDER = /^[a-z0-9_-]{1,40}$/;

function parseReceipt(ctx: string, r: any): Receipt {
  if (!r || typeof r !== "object" || !isStr(r.source_id) || !PROVIDER.test(r.source_id)) throw shape(`${ctx}: bad receipt source_id`);
  const c = `${ctx}/${r.source_id}`;
  if (!isStr(r.status) || !isStr(r.filter_verdict)) throw shape(`${c}: status/filter_verdict missing`);
  if (r.price_disclosure !== "published" && r.price_disclosure !== "withheld") throw shape(`${c}: price_disclosure ${String(r.price_disclosure)}`);
  for (const k of ["price", "smoothed_vote_usd", "sd", "weight", "attendance_factor"]) if (r[k] != null && !isNum(r[k])) throw invalid(`${c}: ${k} is not a finite number`);
  if (isNum(r.weight) && r.weight < 0) throw invalid(`${c}: negative weight`);
  if (r.carried_vote_from != null && !isStr(r.carried_vote_from)) throw shape(`${c}: carried_vote_from not a string`);
  return {
    provider: r.source_id, status: r.status, verdict: r.filter_verdict, price: r.price ?? null, smoothedVote: r.smoothed_vote_usd ?? null,
    sd: r.sd ?? null, weight: r.weight ?? null, liveness: isNum(r.liveness_score) ? r.liveness_score : null, url: isStr(r.source_url) ? r.source_url : null,
    disclosure: r.price_disclosure, upstreamStatus: isStr(r.upstream_status) ? r.upstream_status : null,
    carriedVoteFrom: r.carried_vote_from ?? null, attendanceFactor: r.attendance_factor ?? null,
  };
}

function parseCalc(ctx: string, c: any): CalcParams {
  if (!c || typeof c !== "object") throw shape(`${ctx}: calc_params missing`);
  if (c.aggregation !== "median_ci_votes" && c.aggregation !== "median_stddev_votes") throw invalid(`${ctx}: unsupported aggregation ${String(c.aggregation)}`);
  if (!isNum(c.iqm_alpha) || c.iqm_alpha < 0 || c.iqm_alpha > 0.5) throw invalid(`${ctx}: iqm_alpha must be in [0, 0.5]`);
  if (c.iqm_alpha === 0) throw invalid(`${ctx}: iqm_alpha 0 (point median) is not implemented here`);
  if (!Number.isInteger(c.min_sources_to_publish) || c.min_sources_to_publish < 1) throw invalid(`${ctx}: min_sources_to_publish invalid`);
  if (c.pre_smoothing_half_life_hours == null) throw invalid(`${ctx}: not a smoothing-armed lane; this tool implements the calc_v16/v17 law only`);
  if (!isNum(c.pre_smoothing_half_life_hours) || c.pre_smoothing_half_life_hours <= 0) throw invalid(`${ctx}: pre_smoothing_half_life_hours invalid`);
  const l = c.liveness ?? {};
  return {
    aggregation: c.aggregation, iqmAlpha: c.iqm_alpha, minSourcesToPublish: c.min_sources_to_publish, preSmoothingHalfLifeHours: c.pre_smoothing_half_life_hours,
    attendanceEta: isNum(l.attendance_eta) ? l.attendance_eta : null, gamma: isNum(l.gamma) ? l.gamma : null, weightMin: isNum(l.weight_min) ? l.weight_min : null,
    weightMax: isNum(l.weight_max) ? l.weight_max : null, fenceRejectCarry: typeof l.fence_reject_carry === "boolean" ? l.fence_reject_carry : null, source: "published",
  };
}

/** Pure parser+validator over the corpus text. Exported for tests. */
export function parseCorpus(text: string, capturedAt = new Date().toISOString()): Omit<SnapshotData, "api"> {
  let doc: any;
  try { doc = JSON.parse(text); } catch { throw shape("corpus is not valid JSON"); }
  if (!doc || typeof doc !== "object" || !doc.data || !doc.meta || !doc.license || !isStr(doc.artifact_sha256)) throw shape("corpus envelope keys missing");
  if (!/^[0-9a-f]{64}$/.test(doc.artifact_sha256)) throw shape("artifact_sha256 malformed");
  if (doc.license?.spdx !== "CC-BY-NC-4.0") throw invalid(`unexpected license ${String(doc.license?.spdx)} (expected CC-BY-NC-4.0)`);
  const actual = payloadDigest(doc);
  if (actual !== doc.artifact_sha256) throw invalid(`artifact digest FAIL: embedded ${doc.artifact_sha256} != computed ${actual}`);
  if (doc.data.kind !== "gpu_index_latest" || !Array.isArray(doc.data.observations) || !Array.isArray(doc.data.versions)) throw shape("data.kind/observations/versions unexpected");

  const skus: Record<string, SkuData> = {};
  for (const id of SKU_ORDER) {
    const code = SKU_CODE[id];
    const obs = (doc.data.observations as any[]).filter((o) => o?.sku === code && isStr(o.observed_at));
    if (!obs.length) throw shape(`${code}: no observations`);
    const maxAt = obs.reduce((a, o) => (o.observed_at > a ? o.observed_at : a), "");
    const top = obs.filter((o) => o.observed_at === maxAt);
    if (top.length !== 1) throw invalid(`${code}: ${top.length} observations at the latest stamp ${maxAt} (ambiguous)`);
    const o = top[0];
    const ctx = `${code}@${maxAt}`;
    if (o.kind !== "gpu_price_index_observation" || o.status !== "ok") throw invalid(`${ctx}: kind/status not ok (${String(o.status)})`);
    if (!isNum(o.value_usd_gpu_hr) || o.value_usd_gpu_hr <= 0) throw invalid(`${ctx}: bad value`);
    if (!isNum(o.stability_band_usd_gpu_hr)) throw invalid(`${ctx}: bad stability band`);
    const ver = (doc.data.versions as any[]).find((v) => v?.sku === code);
    if (!ver || ver.methodology_id !== o.methodology_id) throw invalid(`${ctx}: methodology_id ${String(o.methodology_id)} is not the live version ${String(ver?.methodology_id)}`);
    if (!Array.isArray(o.receipts) || !o.receipts.length) throw shape(`${ctx}: receipts missing`);
    const receipts = o.receipts.map((r: any) => parseReceipt(ctx, r));
    const calc = parseCalc(ctx, o.calc_params);
    const prices = receipts.filter((r: Receipt) => r.price != null && r.status === "ok").map((r: Receipt) => r.price!);
    skus[id] = {
      id, code, label: SKU_LABEL[id], unit: String(o.unit ?? "USD/GPU/hour"), methodologyId: o.methodology_id, observedAt: o.observed_at,
      publishedIndex: o.value_usd_gpu_hr, publishedBand: o.stability_band_usd_gpu_hr, calc, coverage: null,
      high: prices.length ? Math.max(...prices) : NaN, low: prices.length ? Math.min(...prices) : NaN,
      inputSnapshotSha256: isStr(o.input_snapshot_sha256) ? o.input_snapshot_sha256 : null, receipts,
    };
  }
  return {
    schema: 2, source: SOURCE_URL, capturedAt, observedAt: skus.b300.observedAt,
    corpus: { url: SOURCE_URL, generatedAt: isStr(doc.meta.generated_at) ? doc.meta.generated_at : null, artifactSha256: doc.artifact_sha256, digestVerified: true, license: doc.license.spdx },
    skus,
  };
}

/** Compare one REST response with the corpus record for the same SKU. Never throws. */
export function compareApi(s: SkuData, text: string): ApiCheck {
  try {
    const d = JSON.parse(text);
    const dd = d?.data;
    if (!dd || !Array.isArray(dd.receipts)) return { status: "unavailable", detail: "response had no receipts" };
    if (dd.observed_at !== s.observedAt || d.meta?.methodology_id !== s.methodologyId)
      return { status: "other-observation", detail: `API is at ${String(dd.observed_at)} (${String(d.meta?.methodology_id)}), corpus at ${s.observedAt}; not comparable` };
    const diffs: string[] = [];
    if (dd.value_usd_gpu_hr !== s.publishedIndex) diffs.push(`value ${dd.value_usd_gpu_hr} vs ${s.publishedIndex}`);
    if (dd.stability_band_usd_gpu_hr !== s.publishedBand) diffs.push(`band ${dd.stability_band_usd_gpu_hr} vs ${s.publishedBand}`);
    const byId = new Map<string, any>(dd.receipts.map((r: any) => [r.source_id, r]));
    if (byId.size !== s.receipts.length) diffs.push(`receipt count ${byId.size} vs ${s.receipts.length}`);
    for (const r of s.receipts) {
      const a = byId.get(r.provider);
      if (!a) { diffs.push(`${r.provider} missing in API`); continue; }
      for (const [k, mine] of [["weight", r.weight], ["sd", r.sd], ["smoothed_vote_usd", r.smoothedVote], ["price", r.price]] as const)
        if ((a[k] ?? null) !== mine) diffs.push(`${r.provider}.${k} ${String(a[k])} vs ${String(mine)}`);
    }
    return diffs.length ? { status: "differs", detail: diffs.slice(0, 6).join("; ") } : { status: "match", detail: "value, band and every receipt weight/sd/cast price/price identical to the corpus" };
  } catch { return { status: "unavailable", detail: "response was not valid JSON" }; }
}

export async function fetchLiveSnapshot(): Promise<SnapshotData> {
  const text = await serial(() => getText(SOURCE_URL));
  const base = parseCorpus(text);
  const api: Record<string, ApiCheck> = {};
  for (const id of SKU_ORDER) {
    try { api[id] = compareApi(base.skus[id], await serial(() => getText(`${API_BASE}/${SKU_CODE[id]}/latest?include=receipts`))); }
    catch (e) { api[id] = { status: "unavailable", detail: e instanceof Error ? e.message : String(e) }; }
  }
  return { ...base, api };
}
