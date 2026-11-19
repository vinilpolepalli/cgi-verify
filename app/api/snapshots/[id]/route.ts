import { getOwner, isId } from "@/lib/owner";
import { err, json } from "@/lib/http";
import { deleteSnapshot, getSnapshot } from "@/lib/db";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Ctx) {
  const owner = await getOwner(); const { id } = await params;
  if (!owner) return err(400, "no owner cookie");
  if (!isId(id)) return err(404, "not found");
  const s = await getSnapshot(owner, id);
  return s ? json(s) : err(404, "not found");
}
export async function DELETE(_: Request, { params }: Ctx) {
  const owner = await getOwner(); const { id } = await params;
  if (!owner) return err(400, "no owner cookie");
  if (!isId(id) || !(await deleteSnapshot(owner, id))) return err(404, "not found");
  return json({ deleted: true });
}
