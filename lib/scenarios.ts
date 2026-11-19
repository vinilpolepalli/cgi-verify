import type { SnapshotData } from "./types";
import { SKU_ORDER } from "./types";
import { checkSku } from "./method";
import { withScenario } from "./inputs";
import { isProviderName } from "./owner";

export type ScenarioParams = { kill: string[]; outliers: { provider: string; multiplier: number }[] };
export type ScenarioSkuResult = {
  sku: string; baseline: number | null; scenario: number | null; delta: number | null; deltaPct: number | null;
  votersBefore: number; votersAfter: number; killedApplied: string[]; outliersApplied: { provider: string; multiplier: number; from: number; to: number }[]; notes: string[];
};
export type ScenarioResult = { version: 2; method: "published"; perSku: ScenarioSkuResult[]; maxAbsDeltaPct: number | null; summary: string };

export function validateParams(body: unknown): { ok: true; params: ScenarioParams; name: string } | { ok: false; error: string } {
  const b = body as { name?: unknown; kill?: unknown; outliers?: unknown } | null;
  if (!b || typeof b !== "object") return { ok: false, error: "body must be a JSON object" };
  const kill = b.kill ?? [], outliers = b.outliers ?? [];
  if (!Array.isArray(kill) || !Array.isArray(outliers)) return { ok: false, error: "kill and outliers must be arrays" };
  if (kill.length > 20 || outliers.length > 20) return { ok: false, error: "too many entries (max 20)" };
  if (!kill.every(isProviderName)) return { ok: false, error: "invalid provider name in kill" };
  const outs: ScenarioParams["outliers"] = [];
  for (const o of outliers as { provider?: unknown; multiplier?: unknown }[]) {
    if (!o || !isProviderName(o.provider)) return { ok: false, error: "invalid provider name in outliers" };
    if (typeof o.multiplier !== "number" || !Number.isFinite(o.multiplier) || o.multiplier < 0.1 || o.multiplier > 10) return { ok: false, error: "multiplier must be a number in [0.1, 10]" };
    outs.push({ provider: o.provider, multiplier: o.multiplier });
  }
  if (!kill.length && !outs.length) return { ok: false, error: "scenario needs at least one kill or outlier" };
  if (outs.some((o) => (kill as string[]).includes(o.provider))) return { ok: false, error: "a provider cannot be both killed and an outlier" };
  const name = typeof b.name === "string" && b.name.trim() ? b.name.trim().slice(0, 80) : "";
  return { ok: true, params: { kill: [...new Set(kill as string[])].sort(), outliers: outs }, name };
}

/** Deterministic: depends only on the stored snapshot and params. Runs the PUBLISHED aggregation on the modified ballot. */
export function runScenario(data: SnapshotData, params: ScenarioParams): ScenarioResult {
  const perSku: ScenarioSkuResult[] = [];
  const val = (c: ReturnType<typeof checkSku>) => (c.status === "missing-input" || !Number.isFinite(c.recomputed) ? null : c.recomputed);
  for (const id of SKU_ORDER) {
    const sku = data.skus[id];
    if (!sku) continue;
    const base = checkSku(sku);
    const liveSet = new Set(base.rows.map((r) => r.provider));
    const killedApplied = params.kill.filter((p) => liveSet.has(p));
    const mult: Record<string, number> = {};
    const outliersApplied: ScenarioSkuResult["outliersApplied"] = [];
    for (const o of params.outliers) {
      const r = base.rows.find((x) => x.provider === o.provider);
      if (!r || params.kill.includes(o.provider)) continue;
      mult[o.provider] = o.multiplier;
      outliersApplied.push({ provider: o.provider, multiplier: o.multiplier, from: r.cast, to: r.cast * o.multiplier });
    }
    const after = checkSku(withScenario(sku, new Set(params.kill), mult));
    const notes: string[] = [];
    const ignored = [...params.kill, ...params.outliers.map((o) => o.provider)].filter((p) => !liveSet.has(p));
    if (ignored.length) notes.push(`not a voter on ${sku.label} (no effect): ${[...new Set(ignored)].join(", ")}`);
    if (base.status === "missing-input") notes.push("baseline not re-derivable (missing input); no scenario value");
    const b = val(base), a = base.status === "missing-input" ? null : val(after);
    if (base.status !== "missing-input" && a == null) notes.push(`published method prints no index here (fewer than ${sku.calc.minSourcesToPublish} observed voters); nothing is filled in`);
    perSku.push({ sku: id, baseline: b, scenario: a, delta: a == null || b == null ? null : a - b, deltaPct: a == null || b == null ? null : (a / b - 1) * 100,
      votersBefore: base.rows.length, votersAfter: after.rows.length, killedApplied, outliersApplied, notes });
  }
  const abs = perSku.filter((s) => s.deltaPct != null).map((s) => Math.abs(s.deltaPct!));
  const max = abs.length ? Math.max(...abs) : null;
  const summary = max == null ? "No index value for any SKU under this scenario."
    : max < 0.5 ? `Published method barely moved (max ${max.toFixed(2)}%).`
    : `Published method moved up to ${max.toFixed(2)}%. Injected outliers scale the cast price only; sd and weights stay as published.`;
  return { version: 2, method: "published", perSku, maxAbsDeltaPct: max, summary };
}
