import { getOwner, isId } from "@/lib/owner";
import { err, json, readJson } from "@/lib/http";
import { getSnapshot, listScenarios, saveScenario, takeToken } from "@/lib/db";
import { runScenario, validateParams } from "@/lib/scenarios";
export const dynamic = "force-dynamic";
const SCENARIOS_PER_HOUR = 60;
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Ctx) {
  const owner = await getOwner(); const { id } = await params;
  if (!owner) return err(400, "no owner cookie");
  if (!isId(id) || !(await getSnapshot(owner, id))) return err(404, "not found");
  return json({ scenarios: await listScenarios(owner, id) });
}
export async function POST(req: Request, { params }: Ctx) {
  const owner = await getOwner(); const { id } = await params;
  if (!owner) return err(400, "no owner cookie");
  const b = await readJson(req);
  if (!b.ok) return b.res;
  const v = validateParams(b.body);
  if (!v.ok) return err(400, v.error);
  if (!isId(id)) return err(404, "not found");
  const snap = await getSnapshot(owner, id);
  if (!snap) return err(404, "not found");
  const retry = await takeToken(owner, "scenario", SCENARIOS_PER_HOUR);
  if (retry != null) return err(429, `scenario limit reached (${SCENARIOS_PER_HOUR}/hour)`, { retryAfterSeconds: retry }, { "retry-after": String(retry) });
  const result = runScenario(snap.data, v.params);
  const parts = [...v.params.kill.map((k) => `kill ${k}`), ...v.params.outliers.map((o) => `${o.provider} x${o.multiplier}`)];
  const saved = await saveScenario(owner, id, v.name || parts.join(", ").slice(0, 80), v.params, result);
  return json(saved, 201);
}
