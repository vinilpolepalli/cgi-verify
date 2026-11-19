import Link from "next/link";
import { notFound } from "next/navigation";
import { getOwner, isId } from "@/lib/owner";
import { getSnapshot, listScenarios } from "@/lib/db";
import { SKU_ORDER, SKU_LABEL, METHOD_REF } from "@/lib/types";
import { checkSku, composite } from "@/lib/method";
import { PASS_FLAG_COPY, STATUS_LABEL } from "@/lib/copy";
import { ago, isLive, usd, utc } from "@/lib/format";
import StressPanel, { type SavedScenario } from "@/components/StressPanel";

export const dynamic = "force-dynamic";

export default async function Detail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sku?: string }> }) {
  const { id } = await params; const { sku: q } = await searchParams;
  const owner = await getOwner();
  if (!owner || !isId(id)) notFound();
  const snap = await getSnapshot(owner, id);
  if (!snap) notFound();
  const skuId = (SKU_ORDER as readonly string[]).includes(q ?? "") ? q! : "b300";
  const sku = snap.data.skus[skuId];
  const rc = snap.results.find((x) => x.sku === skuId)!;
  const ck = checkSku(sku);
  const rows = [...ck.rows].sort((a, b) => a.cast - b.cast);
  const totalW = rows.reduce((a, r) => a + r.weight, 0);
  const comp = ck.status === "missing-input" ? null : composite(ck.rows, sku.calc.iqmAlpha);
  const maxPrice = Math.max(...sku.receipts.map((r) => r.price ?? 0));
  const maxW = Math.max(...rows.map((r) => r.weight), 0.0001);
  const providers = [...new Set(SKU_ORDER.flatMap((s) => snap.data.skus[s].receipts.filter((r) => r.price != null).map((r) => r.provider)))].sort();
  const saved = (await listScenarios(owner, id)) as unknown as SavedScenario[];
  const live = isLive(snap.capturedAt);
  const stale = sku.observedAt;

  const pubSource = sku.calc.source === "published";
  return (
    <main>
      <p className="text-sm"><Link href="/" className="text-accent hover:text-accent-hover hover:underline">Verification log</Link> / snapshot</p>
      <header className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Snapshot <span className="mono">{utc(snap.capturedAt)}</span></h1>
          <p className="mt-1 text-sm text-mute">
            fetched {ago(snap.capturedAt)} <span className={`chip ml-1 ${live ? "chip-live" : "chip-old"}`}>{live ? "LIVE" : "stored"}</span>
            {" "}· source <a className="text-accent hover:underline" href={snap.sourceUrl} target="_blank" rel="noreferrer">{snap.sourceUrl}</a>
            {" "}· index observed <span className="mono">{utc(stale)}</span>
          </p>
          <p className="mt-1 text-xs text-mute">Age is how long ago this was fetched; it says nothing about fidelity. The chips below come from the re-derivation.</p>
        </div>
        <span className={`chip ${snap.verdict === "pass" ? "chip-pass" : "chip-flag"}`}>{snap.verdict}</span>
      </header>

      <nav className="mt-5 flex flex-wrap gap-2" role="tablist" aria-label="SKU">
        {SKU_ORDER.map((k) => {
          const r = snap.results.find((x) => x.sku === k)!;
          return (
            <Link key={k} role="tab" aria-selected={k === skuId} href={`/s/${id}?sku=${k}`}
              className={`rounded-btn border px-3 py-1.5 text-sm ${k === skuId ? "border-accent bg-accent text-white" : "border-hair bg-white hover:bg-[#f4f3f0]"}`}>
              {SKU_LABEL[k]} <span title={r.pass ? "Published method reproduces the published print" : `flag: ${STATUS_LABEL[r.status]}`} className={k === skuId ? "text-white/80" : r.pass ? "text-[#166534]" : "text-accent"}>{r.pass ? "pass" : "flag"}</span>
            </Link>
          );
        })}
      </nav>

      {/* Re-derivation panel */}
      <section className="card mt-4 p-4 sm:p-5">
        <p className="label">{sku.label} · {sku.unit} · methodology id <span className="mono normal-case">{sku.methodologyId}</span></p>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <div><p className="label">published index</p><p className="mono text-3xl font-semibold">{usd(sku.publishedIndex, 6)}</p>
            <p className="text-xs text-mute">stability band {sku.publishedBand == null ? "n/a" : usd(sku.publishedBand, 6)} · {rc.voters} voters ({rc.carried} carried) · hi {usd(sku.high)} / lo {usd(sku.low)}</p></div>
          <div><p className="label">re-derived (published method)</p><p className="mono text-3xl font-semibold text-accent">{rc.recomputed == null ? "n/a" : usd(rc.recomputed, 6)}</p>
            <p className="text-xs text-mute">{rc.recomputed == null ? "not computable from the published record" : <>band {usd(rc.recomputedBand, 6)} · diff {rc.diff! >= 0 ? "+" : ""}{rc.diff!.toFixed(6)}</>}</p></div>
          <div><p className="label">result</p><p><span className={`chip ${rc.pass ? "chip-pass" : "chip-flag"}`}>{rc.pass ? "pass" : "flag"}</span> <span className="text-xs text-mute">{STATUS_LABEL[rc.status]}</span></p>
            <p className="mt-1 text-xs text-mute">{rc.detail}{rc.pass ? "" : " This is a reported fact with the exact inputs listed below, not an accusation; it may equally reflect a limit of this reimplementation."}</p></div>
        </div>
        {!pubSource && <p className="mt-3 rounded-btn border border-hair px-3 py-2 text-xs text-mute">Stored from the earlier page scrape, which carried no calc_params, carried-vote markers or digest. Input assumed here: iqm_alpha = {sku.calc.iqmAlpha}, the value the official record discloses for this methodology id; sd taken from the page&apos;s per-provider band. Every other input is as stored.</p>}

        <details className="mt-4 rounded-card border border-hair" open>
          <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">Votes and band (each voter casts its weight at cast price - sd, cast price, cast price + sd)</summary>
          <div className="overflow-x-auto">
            <table className="w-full text-sm mono">
              <thead><tr><th className="th label">Voter</th><th className="th label text-right">Cast price (smoothed vote)</th><th className="th label text-right">sd</th><th className="th label text-right">Weight</th><th className="th label text-right">Votes</th><th className="th label">Kind</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.provider}><td className="td">{r.provider}</td><td className="td text-right">{r.cast}</td><td className="td text-right">{r.sd}</td><td className="td text-right">{r.weight}</td>
                    <td className="td text-right">{(r.cast - r.sd).toFixed(6)} / {r.cast.toFixed(6)} / {(r.cast + r.sd).toFixed(6)}</td><td className="td">{r.carried ? "carried" : "observed"}</td></tr>
                ))}
                <tr><td className="td font-semibold" colSpan={3}>Total weight (x3 votes = {(totalW * 3).toFixed(6)})</td><td className="td text-right font-semibold">{totalW.toFixed(6)}</td><td className="td" colSpan={2} /></tr>
                {comp && <>
                  <tr><td className="td font-semibold" colSpan={4}>Index = exact mean of votes in the band [{(0.5 - comp.alpha).toFixed(5)}, {(0.5 + comp.alpha).toFixed(5)}] of cumulative vote weight (alpha {comp.alpha})</td><td className="td text-right font-semibold" colSpan={2}>{comp.value.toFixed(6)}</td></tr>
                  <tr><td className="td font-semibold" colSpan={4}>Vote p25 / p75 (weighted); band = max(index - p25, p75 - index)</td><td className="td text-right font-semibold" colSpan={2}>{comp.p25.toFixed(6)} / {comp.p75.toFixed(6)} → {comp.band.toFixed(6)}</td></tr>
                  <tr><td className="td font-semibold" colSpan={4}>Point median of votes (diagnostic only)</td><td className="td text-right" colSpan={2}>{comp.voteMedian.toFixed(6)}</td></tr></>}
              </tbody>
            </table>
          </div>
        </details>

        <p className="mt-3 text-xs text-mute">Parameters used ({pubSource ? "from the record's own calc_params" : "assumed, see note"}): aggregation {sku.calc.aggregation}, iqm_alpha {sku.calc.iqmAlpha}, min_sources_to_publish {sku.calc.minSourcesToPublish}, pre-smoothing half-life {sku.calc.preSmoothingHalfLifeHours ?? "n/a"} h{sku.calc.attendanceEta != null ? `, attendance eta ${sku.calc.attendanceEta}` : ""}{sku.calc.gamma != null ? `, gamma ${sku.calc.gamma}` : ""}{sku.calc.weightMin != null ? `, weight floor ${sku.calc.weightMin}` : ""}{sku.calc.weightMax != null ? ` / ceiling ${sku.calc.weightMax}` : ""}.</p>

        <details className="mt-4 rounded-card border border-hair">
          <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">Exploratory candidates - not the published method</summary>
          <p className="px-3 pb-3 text-sm text-mute">Earlier versions of this tool compared three guessed estimators (weighted mean, lower weighted median, interpolated weighted median). The published method is now implemented, so they are no longer computed or used for pass/flag. Stored page-era snapshots keep their inputs and are re-derived with the published method above.</p>
        </details>
      </section>

      {/* Provider table */}
      <section className="card mt-4 overflow-hidden">
        <div className="px-4 pt-4"><h2 className="text-lg font-bold">Providers</h2>
          <p className="text-xs text-mute">Bars: raw print against the highest live print (left), share of the largest vote weight (right). Providers that did not vote carry no weight.</p></div>
        <table className="stack mt-2 w-full text-sm">
          <thead className="bg-[#f7f6f4]"><tr><th className="th label">Provider</th><th className="th label text-right">Print</th><th className="th label text-right">Cast price</th><th className="th label text-right">sd</th><th className="th label text-right">Weight</th><th className="th label text-right">Attendance</th><th className="th label">Print</th><th className="th label">Weight</th></tr></thead>
          <tbody>
            {sku.receipts.map((r) => {
              const voted = rows.find((x) => x.provider === r.provider);
              return (
                <tr key={r.provider}>
                  <td className="td font-semibold" data-l="Provider">{r.url ? <a className="hover:text-accent hover:underline" href={r.url} target="_blank" rel="noreferrer">{r.provider}</a> : r.provider}</td>
                  {!voted && r.price == null ? <td className="td text-mute" colSpan={7} data-l="Status"><span className="chip chip-old">{r.status.toUpperCase()}</span> no print; casts no vote</td> : <>
                    <td className="td mono text-right" data-l="Print">{r.price == null ? "n/a" : usd(r.price, 4)}</td>
                    <td className="td mono text-right" data-l="Cast price">{r.smoothedVote == null ? "n/a" : usd(r.smoothedVote, 4)}{voted?.carried && <span className="ml-1 chip chip-old">carried</span>}</td>
                    <td className="td mono text-right" data-l="sd">{r.sd == null ? "n/a" : usd(r.sd, 4)}</td>
                    <td className="td mono text-right" data-l="Weight">{r.weight == null ? "n/a" : (r.weight * 100).toFixed(2) + "%"}</td>
                    <td className="td mono text-right" data-l="Attendance">{r.attendanceFactor == null ? "n/a" : r.attendanceFactor.toFixed(3)}</td>
                    <td className="td" data-l="Print bar"><Bar frac={(r.price ?? 0) / maxPrice} /></td>
                    <td className="td" data-l="Weight bar"><Bar frac={(voted?.weight ?? 0) / maxW} strong /></td></>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <StressPanel snapshotId={id} providers={providers} saved={saved} />

      {/* Methodology */}
      <section className="card mt-6 p-4 sm:p-5">
        <h2 className="text-lg font-bold">Methodology and provenance</h2>
        <p className="mt-2 text-sm">Method: the published Computable GPU Index methodology, <a className="text-accent hover:underline" href={METHOD_REF.repo} target="_blank" rel="noreferrer">{METHOD_REF.repo}</a> (Apache-2.0), read at commit <span className="mono">{METHOD_REF.commit}</span> ({METHOD_REF.commitDate}); methodology id <span className="mono">{sku.methodologyId}</span>. Reimplemented from {METHOD_REF.methodologyDoc} and {METHOD_REF.code}; their code was read, not executed.</p>
        <div className="mt-3 grid gap-5 md:grid-cols-3 text-sm">
          <div><p className="label">published inputs used</p><ul className="mt-1 list-disc space-y-1 pl-4">
            <li>Per receipt: cast price (smoothed_vote_usd), sd, liveness weight, status, filter verdict, carried-vote marker, upstream status.</li>
            <li>calc_params: iqm_alpha, min_sources_to_publish, smoothing and liveness parameters.</li>
            <li>{snap.data.corpus ? <>Corpus digest {snap.data.corpus.digestVerified ? "verified" : "NOT verified"} (sha256 <span className="mono">{snap.data.corpus.artifactSha256?.slice(0, 16)}…</span>, generated {snap.data.corpus.generatedAt ?? "n/a"}, {snap.data.corpus.license}).</> : "Page-scrape era: no digest was available."}</li>
            <li>{snap.data.api ? <>REST cross-check for {sku.code}: <b>{snap.data.api[skuId]?.status ?? "n/a"}</b>{snap.data.api[skuId] ? ` (${snap.data.api[skuId].detail})` : ""}.</> : "No REST cross-check was recorded for this snapshot."}</li></ul></div>
          <div><p className="label">what pass / flag mean</p><ul className="mt-1 list-disc space-y-1 pl-4">
            <li>{PASS_FLAG_COPY}</li>
            <li>The equality test is exact at the published 6-decimal precision (5e-7 float tolerance noted separately in the detail text).</li></ul></div>
          <div><p className="label">not re-derived here</p><ul className="mt-1 list-disc space-y-1 pl-4">
            <li>The liveness weights, the 1-hour EWMA that produces cast prices, the outlier fence and the per-provider sd are inputs taken as published. They need the price history (90 days of receipts, per-day archives) and are out of scope; the corpus/API discloses them per observation, so a published value is reproducible from its own receipts, but those upstream steps are not independently re-run.</li>
            <li>Whether the provider source pages match the reported prices (only the published record was fetched).</li>
            <li>Stress scenarios keep weights and sd as published (weights are not re-derived).</li></ul></div>
        </div>
      </section>
    </main>
  );
}

function Bar({ frac, strong }: { frac: number; strong?: boolean }) {
  const w = Math.max(0, Math.min(1, frac)) * 100;
  return (
    <svg width="100%" height="10" viewBox="0 0 100 10" preserveAspectRatio="none" role="img" aria-label={`${w.toFixed(0)}%`} className="min-w-[80px]">
      <rect x="0" y="0" width="100" height="10" fill="#f0eeea" />
      <rect x="0" y="0" width={w} height="10" fill={strong ? "#b45309" : "#d6a574"} />
    </svg>
  );
}
