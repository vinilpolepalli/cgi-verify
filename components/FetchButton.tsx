"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function FetchButton({ label = "Fetch and verify now" }: { label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/snapshots", { method: "POST" });
      const j = await res.json();
      if (!res.ok) {
        const kind = j.kind ? ` [${j.kind}]` : "";
        const wait = j.retryAfterSeconds ? ` Try again in ${Math.ceil(j.retryAfterSeconds / 60)} min.` : "";
        setError(`${res.status}${kind}: ${j.error}.${wait}${j.stored === false ? " Nothing was stored." : ""}`);
      } else router.push(`/s/${j.id}`);
    } catch (e) { setError("network: " + (e instanceof Error ? e.message : String(e))); }
    setBusy(false);
  }
  return (
    <div>
      <button className="btn" onClick={go} disabled={busy}>{busy ? "Fetching and validating..." : label}</button>
      {error && <p role="alert" className="mt-3 rounded-btn border border-[#e6c39a] bg-white px-3 py-2 text-sm text-accent-hover">Fetch failed. {error}</p>}
    </div>
  );
}
