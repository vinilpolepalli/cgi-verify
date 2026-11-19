import type { SnapshotData } from "./types";
import { SKU_ORDER } from "./types";
import { resultFor, type SkuResult } from "./method";
export function recomputeAll(data: SnapshotData): SkuResult[] {
  return SKU_ORDER.filter((id) => data.skus[id]).map((id) => resultFor(data.skus[id]));
}
export const verdictOf = (r: SkuResult[]) => (r.every((x) => x.pass) ? "pass" : "flag");
