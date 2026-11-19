import { NextResponse, type NextRequest } from "next/server";

const UID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Assigns an anonymous owner id (httpOnly cookie) on first visit and forwards it to this same request.
export function middleware(req: NextRequest) {
  const cur = req.cookies.get("cgi_uid")?.value;
  if (cur && UID.test(cur)) return NextResponse.next();
  const uid = crypto.randomUUID();
  const headers = new Headers(req.headers);
  const rest = (headers.get("cookie") ?? "").split(";").map((s) => s.trim()).filter((s) => s && !s.startsWith("cgi_uid="));
  headers.set("cookie", [...rest, `cgi_uid=${uid}`].join("; "));
  const res = NextResponse.next({ request: { headers } });
  res.cookies.set("cgi_uid", uid, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365, secure: process.env.NODE_ENV === "production" });
  return res;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
