import { NextResponse } from "next/server";
export const MAX_BODY = 20 * 1024;
export const json = (body: unknown, status = 200, headers?: Record<string, string>) => NextResponse.json(body, { status, headers });
export const err = (status: number, error: string, extra: Record<string, unknown> = {}, headers?: Record<string, string>) => json({ error, ...extra }, status, headers);
/** Reads a JSON body, enforcing the 20KB cap (413). Empty body => {}. */
export async function readJson(req: Request): Promise<{ ok: true; body: unknown } | { ok: false; res: NextResponse }> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BODY) return { ok: false, res: err(413, "payload too large (20KB max)") };
  const text = await req.text();
  if (text.length > MAX_BODY) return { ok: false, res: err(413, "payload too large (20KB max)") };
  if (!text.trim()) return { ok: true, body: {} };
  try { return { ok: true, body: JSON.parse(text) }; } catch { return { ok: false, res: err(400, "invalid JSON") }; }
}
