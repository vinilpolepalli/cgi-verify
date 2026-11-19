export const usd = (n: number | null | undefined, d = 2) => (n != null && Number.isFinite(n) ? "$" + n.toFixed(d) : "n/a");
export const pct = (n: number, d = 2) => (n >= 0 ? "+" : "") + n.toFixed(d) + "%";
export function ago(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
export const isLive = (iso: string, now = Date.now()) => now - Date.parse(iso) < 15 * 60 * 1000;
export const utc = (iso: string) => iso.replace("T", " ").replace(/\.\d+Z$/, "Z").replace(/Z$/, " UTC");
