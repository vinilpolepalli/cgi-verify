import Link from "next/link";
import { getOwner, isId } from "@/lib/owner";
import { getSnapshot, listSnapshots } from "@/lib/db";
import { SKU_ORDER, SKU_LABEL } from "@/lib/types";
import { usd, utc, pct } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Compare({ searchParams }: { searchParams: Promise<{ a?: string; b?: string }> }) {
  const { a, b } = await searchParams;
  const owner = await getOwner();
  const all = owner ? await listSnapshots(owner) : [];
  const A = owner && a && isId(a) ? await getSnapshot(owner, a) : null;
  const B = owner && b && isId(b) ? await getSnapshot(owner, b) : null;
  const opt = (v?: string) => all.map((s) => <option key={s.id} value={s.id} selected={s.id === v}>{utc(s.capturedAt)}</option>);
  return (
    <main>
      <h1 className="text-2xl font-bold tracking-tight">Compare two snapshots</h1>
      <form className="mt-4 flex flex-wrap items-end gap-3" method="get">
        <label className="text-sm"><span className="label block">from (A)</span><select name="a" className="inp mono">{opt(a)}</select></label>
        <label className="text-sm"><span className="label block">to (B)</span><select name="b" className="inp mono">{opt(b)}</select></label>
        <button className="btn" type="submit">Compare</button>
      </form>
      {all.length < 2 && <p className="mt-4 text-sm text-mute">You need at least two stored snapshots to compare. <Link className="text-accent hover:underline" href="/">Back to the log</Link>.</p>}
      {A && B && (
        <div className="mt-6 space-y-6">
          <p className="text-sm text-mute">A: <span className="mono">{utc(A.capturedAt)}</span> · B: <span className="mono">{utc(B.capturedAt)}</span>. Deltas are B minus A, from stored data only.</p>
          <section className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr><th className="th label">SKU</th><th className="th label text-right">Published A</th><th className="th label text-right">Published B</th><th className="th label text-right">Delta</th><th className="th label text-right">Re-derived A</th><th className="th label text-right">Re-derived B</th><th className="th label text-right">Delta</th></tr></thead>
              <tbody>{SKU_ORDER.map((s) => {
                const x = A.results.find((r) => r.sku === s)!, y = B.results.find((r) => r.sku === s)!;
                return <tr key={s}><td className="td font-semibold">{SKU_LABEL[s]}</td><td className="td mono text-right">{usd(x.published, 4)}</td><td className="td mono text-right">{usd(y.published, 4)}</td>
                  <td className="td mono text-right">{pct((y.published / x.published - 1) * 100)}</td><td className="td mono text-right">{usd(x.recomputed, 6)}</td><td className="td mono text-right">{usd(y.recomputed, 6)}</td>
                  <td className="td mono text-right">{x.recomputed == null || y.recomputed == null ? "n/a" : pct((y.recomputed / x.recomputed - 1) * 100)}</td></tr>;
              })}</tbody>
            </table>
          </section>
          {SKU_ORDER.map((s) => {
            const ra = A.data.skus[s].receipts, rb = B.data.skus[s].receipts;
            const names = [...new Set([...ra, ...rb].map((r) => r.provider))].sort();
            return (
              <section key={s} className="card overflow-x-auto">
                <h2 className="px-3 pt-3 font-bold">{SKU_LABEL[s]} provider prices</h2>
                <table className="w-full text-sm">
                  <thead><tr><th className="th label">Provider</th><th className="th label text-right">A</th><th className="th label text-right">B</th><th className="th label text-right">Delta</th></tr></thead>
                  <tbody>{names.map((n) => {
                    const pa = ra.find((r) => r.provider === n)?.price ?? null, pb = rb.find((r) => r.provider === n)?.price ?? null;
                    return <tr key={n}><td className="td">{n}</td><td className="td mono text-right">{pa == null ? "MISSING" : usd(pa, 4)}</td><td className="td mono text-right">{pb == null ? "MISSING" : usd(pb, 4)}</td>
                      <td className="td mono text-right">{pa == null || pb == null ? "n/a" : pa === pb ? "0.00%" : pct((pb / pa - 1) * 100)}</td></tr>;
                  })}</tbody>
                </table>
              </section>
            );
          })}
        </div>
      )}
      {(a || b) && !(A && B) && all.length >= 2 && <p className="mt-4 text-sm text-accent-hover">One or both snapshots were not found in your log.</p>}
    </main>
  );
}
