import type { SkuData } from "./types";
export function withScenario(sku: SkuData, killed: ReadonlySet<string>, multipliers: Record<string, number>): SkuData {
  return {
    ...sku,
    receipts: sku.receipts.filter((r) => !killed.has(r.provider)).map((r) =>
      multipliers[r.provider] != null && r.smoothedVote != null ? { ...r, smoothedVote: r.smoothedVote * multipliers[r.provider] } : r),
  };
}
