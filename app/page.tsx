import Link from "next/link";
import { getOwner } from "@/lib/owner";
import { listSnapshots } from "@/lib/db";
import FetchButton from "@/components/FetchButton";
import { SKU_ORDER, SKU_LABEL } from "@/lib/types";
import { ago, usd, utc } from "@/lib/format";
import { PASS_FLAG_COPY, STATUS_LABEL } from "@/lib/copy";

export const dynamic = "force-dynamic";

export default async function Home() {
  const owner = await getOwner();
  const rows = owner ? await listSnapshots(owner) : [];
  return (
    <main>
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-bold tracking-tight">Verification log</h1>
          <p className="mt-2 text-sm text-mute">
            Each entry is one fetch of the official published record of the Computable GPU Index (receipts, weights, parameters), re-derived here with the published method and compared with the published value.
            Stored snapshots are re-viewed without any new fetch; fetching is always an explicit action.
          </p>
        </div>
        <FetchButton />
      </section>

      {rows.length === 0 ? (
        <section className="card mt-6 p-6">
          <p className="label">no verifications yet</p>
          <p className="mt-2 max-w-xl text-sm">
            CGI Verify fetches the published record from data.getcomputable.com (digest-checked, cross-checked against api.getcomputable.com), and re-derives each SKU's index with the published interquantile-mean method.
            Press the button to record your first verification; if the record cannot be parsed or validated, nothing is stored and you will see why.
          </p>
        </section>
      ) : (
        <section className="card mt-6 overflow-hidden">
          <table className="stack w-full text-sm">
            <thead className="bg-[#f7f6f4]">
              <tr><th className="th label">Captured (UTC)</th><th className="th label">Age</th><th className="th label">Skus</th>
                {SKU_ORDER.map((s) => <th key={s} className="th label">{SKU_LABEL[s]} re-derived vs published</th>)}<th className="th label">Result</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-[#faf9f7]">
                  <td className="td mono" data-l="Captured"><Link className="font-semibold text-accent hover:text-accent-hover hover:underline" href={`/s/${r.id}`}>{utc(r.capturedAt)}</Link></td>
                  <td className="td text-mute" data-l="Age">{ago(r.capturedAt)}</td>
                  <td className="td" data-l="SKUs">{r.results.length}</td>
                  {SKU_ORDER.map((s) => {
                    const x = r.results.find((q) => q.sku === s);
                    return (
                      <td key={s} className="td mono" data-l={SKU_LABEL[s]}>
                        {x ? <>{usd(x.recomputed, 6)} / {usd(x.published, 6)} <span className={x.pass ? "text-[#166534]" : "text-accent"}>({x.pass ? "exact" : STATUS_LABEL[x.status]})</span></> : "n/a"}
                      </td>
                    );
                  })}
                  <td className="td" data-l="Result"><span title={PASS_FLAG_COPY} className={`chip ${r.verdict === "pass" ? "chip-pass" : "chip-flag"}`}>{r.verdict}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-hair px-3 py-2 text-xs text-mute">
            {PASS_FLAG_COPY} Snapshots from the earlier page-scrape era are re-derived from their stored inputs with the same engine.
          </p>
        </section>
      )}
    </main>
  );
}
