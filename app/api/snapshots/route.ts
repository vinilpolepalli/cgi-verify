import { getOwner } from "@/lib/owner";
import { err, json } from "@/lib/http";
import { listSnapshots, saveSnapshot, takeToken } from "@/lib/db";
import { fetchLiveSnapshot, FetchError } from "@/lib/computable";
import { recomputeAll } from "@/lib/summary";

export const dynamic = "force-dynamic";
const FETCHES_PER_HOUR = 6;

export async function GET() {
  const owner = await getOwner();
  if (!owner) return err(400, "no owner cookie");
  const rows = await listSnapshots(owner);
  return json({ snapshots: rows.map((r) => ({ id: r.id, capturedAt: r.capturedAt, verdict: r.verdict, results: r.results })) });
}

export async function POST(req: Request) {
  const owner = await getOwner();
  if (!owner) return err(400, "no owner cookie");
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > 20 * 1024) return err(413, "payload too large (20KB max)");
  const retry = await takeToken(owner, "fetch", FETCHES_PER_HOUR);
  if (retry != null) return err(429, `fetch limit reached (${FETCHES_PER_HOUR}/hour)`, { retryAfterSeconds: retry }, { "retry-after": String(retry) });
  try {
    const data = await fetchLiveSnapshot();
    const results = recomputeAll(data);
    const { row, pruned } = await saveSnapshot(owner, data, results);
    return json({ id: row.id, capturedAt: row.capturedAt, verdict: row.verdict, results, pruned }, 201);
  } catch (e) {
    // Fail closed: nothing stored. Show the failure honestly.
    if (e instanceof FetchError) return err(502, e.message, { kind: e.kind, stored: false });
    return err(500, "unexpected error: " + (e instanceof Error ? e.message : String(e)), { kind: "internal", stored: false });
  }
}
