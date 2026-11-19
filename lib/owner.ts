import { cookies } from "next/headers";
const UID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export async function getOwner(): Promise<string | null> {
  const v = (await cookies()).get("cgi_uid")?.value;
  return v && UID.test(v) ? v : null;
}
export const isId = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
export const isProviderName = (s: unknown): s is string => typeof s === "string" && /^[a-z0-9_-]{1,40}$/.test(s);
