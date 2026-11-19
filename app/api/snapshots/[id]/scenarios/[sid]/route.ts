import { getOwner, isId } from "@/lib/owner";
import { err, json } from "@/lib/http";
import { deleteScenario } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string; sid: string }> }) {
  const owner = await getOwner(); const { id, sid } = await params;
  if (!owner) return err(400, "no owner cookie");
  if (!isId(id) || !isId(sid) || !(await deleteScenario(owner, id, sid))) return err(404, "not found");
  return json({ deleted: true });
}
