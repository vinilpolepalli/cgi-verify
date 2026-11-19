export type Receipt = {
  provider: string; status: string; verdict: string; price: number | null; smoothedVote: number | null;
  /** Published per-provider vote standard deviation (the "stability band" per provider on the page). */
  sd: number | null; weight: number | null; liveness: number | null; url: string | null;
  disclosure: "published" | "withheld"; upstreamStatus: string | null; carriedVoteFrom: string | null; attendanceFactor: number | null;
};
export type CalcParams = {
  aggregation: string; iqmAlpha: number; minSourcesToPublish: number; preSmoothingHalfLifeHours: number | null;
  attendanceEta: number | null; gamma: number | null; weightMin: number | null; weightMax: number | null; fenceRejectCarry: boolean | null;
  /** "published" = read from the record's own calc_params; "assumed" = legacy page snapshot, alpha taken from the corpus for the same method id. */
  source: "published" | "assumed";
};
export type SkuData = {
  id: string; code: string; label: string; unit: string; methodologyId: string; observedAt: string;
  publishedIndex: number; publishedBand: number | null; calc: CalcParams;
  coverage?: { passing: number; total: number } | null; high: number; low: number;
  inputSnapshotSha256?: string | null; receipts: Receipt[];
};
export type ApiCheck = { status: "match" | "differs" | "unavailable" | "other-observation"; detail: string };
export type SnapshotData = {
  schema: 2; source: string; capturedAt: string; observedAt: string; legacyPageScrape?: boolean;
  corpus: { url: string; generatedAt: string | null; artifactSha256: string | null; digestVerified: boolean; license: string | null } | null;
  api: Record<string, ApiCheck> | null;
  skus: Record<string, SkuData>;
};
export const METHOD_REF = {
  repo: "https://github.com/getcomputable/gpu-index", commit: "528b63925b005dd151a5d8600fdb1ea7a37fa2bb", commitDate: "2026-09-24",
  methodologyDoc: "METHODOLOGY.md (sections 7.1, 8.6, 12.3)", code: "src/gpu_index/index/composite.py, src/gpu_index/published/verify.py",
} as const;
export const SKU_ORDER = ["b300", "b200", "h100", "h200"] as const;
export const SKU_LABEL: Record<string, string> = { b300: "B300", b200: "B200", h100: "H100 SXM", h200: "H200 SXM" };
export const SKU_CODE: Record<string, string> = { b300: "B300", b200: "B200", h100: "H100", h200: "H200" };

/** Upgrade a stored snapshot (page-scrape era had no schema field) to the current shape. Pure. */
export function normalizeSnapshot(raw: any): SnapshotData {
  if (raw?.schema === 2) return raw as SnapshotData;
  const skus: Record<string, SkuData> = {};
  for (const [id, s] of Object.entries<any>(raw.skus ?? {})) {
    skus[id] = {
      id, code: s.code, label: s.label, unit: s.unit, methodologyId: s.methodologyId, observedAt: s.observedAt,
      publishedIndex: s.publishedIndex, publishedBand: s.publishedBand ?? null,
      // The page payload carries no calc_params: alpha 0.16666 is the value the official corpus discloses for these method ids.
      calc: { aggregation: "median_ci_votes", iqmAlpha: 0.16666, minSourcesToPublish: 5, preSmoothingHalfLifeHours: 1, attendanceEta: null, gamma: null, weightMin: s.weightFloor ?? null, weightMax: s.weightCap ?? null, fenceRejectCarry: null, source: "assumed" },
      coverage: s.coverage ?? null, high: s.high, low: s.low, inputSnapshotSha256: null,
      receipts: (s.receipts ?? []).map((r: any) => ({
        provider: r.provider, status: r.status, verdict: r.verdict, price: r.price, smoothedVote: r.smoothedVote, sd: r.band ?? null,
        weight: r.weight, liveness: r.liveness ?? null, url: r.url ?? null, disclosure: "published", upstreamStatus: null, carriedVoteFrom: null, attendanceFactor: null,
      })),
    };
  }
  return { schema: 2, source: raw.source, capturedAt: raw.capturedAt, observedAt: raw.observedAt, legacyPageScrape: true, corpus: null, api: null, skus };
}
