"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ScenarioResult, ScenarioParams } from "@/lib/scenarios";
import { SKU_LABEL } from "@/lib/types";
import { usd, pct } from "@/lib/format";

export type SavedScenario = { id: string; name: string; params: ScenarioParams; result: (ScenarioResult & { version: 2 }) | (Omit<ScenarioResult, "version" | "perSku"> & { version?: 1; perSku: never[] }); createdAt: string };

export default function StressPanel({ snapshotId, providers, saved }: { snapshotId: string; providers: string[]; saved: SavedScenario[] }) {
  const router = useRouter();
  const [kill, setKill] = useState<string[]>([]);
  const [outs, setOuts] = useState<Record<string, number>>({});
  const [mult, setMult] = useState(3);
  const [outProv, setOutProv] = useState(providers[0] ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toggle = (p: string) => setKill((k) => (k.includes(p) ? k.filter((x) => x !== p) : [...k, p]));

  async function run() {
    setBusy(true); setError(null);
    const body = { kill, outliers: Object.entries(outs).map(([provider, multiplier]) => ({ provider, multiplier })) };
    const res = await fetch(`/api/snapshots/${snapshotId}/scenarios`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(`${res.status}: ${j.error ?? "failed"}`); return; }
    setKill([]); setOuts({}); router.refresh();
  }
  async function del(sid: string) {
    await fetch(`/api/snapshots/${snapshotId}/scenarios/${sid}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <section className="card mt-6 p-4 sm:p-5" id="stress">
      <h2 className="text-lg font-bold">Stress test</h2>
      <p className="mt-1 text-sm text-mute">Runs the published interquantile-mean method on the server against this stored snapshot; same input, same result. A killed provider casts no votes (the method normalizes by the remaining vote weight itself); an injected outlier scales that provider&apos;s cast price only, with sd and weights left as published. Liveness weights are not re-derived, so this shows the aggregation&apos;s sensitivity, not a full re-run of the weighting.</p>
      <div className="mt-4 grid gap-5 md:grid-cols-2">
        <div>
          <p className="label">kill providers (simulate missing)</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {providers.map((p) => (
              <button key={p} type="button" aria-pressed={kill.includes(p)} onClick={() => toggle(p)}
                className={`rounded-btn border px-2.5 py-1 text-sm ${kill.includes(p) ? "border-accent bg-accent text-white" : "border-hair bg-white hover:bg-[#f4f3f0]"}`}>{p}</button>
            ))}
          </div>
        </div>
        <div>
          <p className="label">inject outlier prices (multiple allowed)</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select className="inp" value={outProv} onChange={(e) => setOutProv(e.target.value)} aria-label="Provider">{providers.map((p) => <option key={p}>{p}</option>)}</select>
            <span className="text-sm">x</span>
            <input className="inp mono w-20" type="number" min={0.1} max={10} step={0.1} value={mult} onChange={(e) => setMult(Number(e.target.value))} aria-label="Multiplier" />
            <button type="button" className="btn btn-quiet" onClick={() => outProv && setOuts((o) => ({ ...o, [outProv]: mult }))}>Add</button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {Object.entries(outs).map(([p, m]) => (
              <button key={p} type="button" className="rounded-btn border border-hair px-2 py-1 text-sm mono" onClick={() => setOuts((o) => { const n = { ...o }; delete n[p]; return n; })}>{p} x{m} (remove)</button>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button className="btn" onClick={run} disabled={busy || (!kill.length && !Object.keys(outs).length)}>{busy ? "Running..." : "Run and save scenario"}</button>
        {error && <span role="alert" className="text-sm text-accent-hover">{error}</span>}
      </div>

      <h3 className="mt-6 label">saved scenarios ({saved.length})</h3>
      {saved.length === 0 && <p className="mt-2 text-sm text-mute">None yet for this snapshot.</p>}
      <div className="mt-2 space-y-3">
        {saved.map((s) => (
          <details key={s.id} className="rounded-card border border-hair">
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
              <span><b>{s.name}</b> <span className="text-mute">- {s.result.summary}</span></span>
            </summary>
            <div className="overflow-x-auto px-3 pb-3">
              {s.result.version !== 2 ? (
                <p className="text-sm text-mute">Saved before the published method was adopted (it used an exploratory candidate estimator, not the published method); its per-SKU table is not shown. Delete it and re-run for a current result.</p>
              ) : (
              <table className="w-full text-sm">
                <thead><tr><th className="th label">SKU</th><th className="th label">Voters</th><th className="th label">Baseline (published method)</th><th className="th label">Scenario</th><th className="th label">Delta</th><th className="th label">Notes</th></tr></thead>
                <tbody>
                  {s.result.perSku.map((r) => (
                    <tr key={r.sku}>
                      <td className="td">{SKU_LABEL[r.sku]}</td>
                      <td className="td mono">{r.votersBefore}{"->"}{r.votersAfter}</td>
                      <td className="td mono">{usd(r.baseline, 4)}</td>
                      <td className="td mono">{usd(r.scenario, 4)}</td>
                      <td className="td mono">{r.deltaPct == null ? "n/a" : `${pct(r.deltaPct)} (${r.delta! >= 0 ? "+" : ""}${r.delta!.toFixed(4)})`}</td>
                      <td className="td text-xs text-mute">{r.notes.join("; ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>)}
              <button className="btn btn-quiet mt-3" onClick={() => del(s.id)}>Delete scenario</button>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
