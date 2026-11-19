import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
export const metadata: Metadata = {
  title: "CGI Verify: re-derive and stress-test the Computable GPU Index",
  description: "Independent verification log for the Computable GPU Index: fetch the published inputs, recompute, audit, stress-test.",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ground text-ink">
        <header className="border-b border-hair bg-white">
          <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <Link href="/" className="flex items-baseline gap-2">
              <span className="text-lg font-bold tracking-tight">CGI Verify</span>
              <span className="label hidden sm:inline">independent verification log</span>
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/compare" className="text-mute hover:text-accent">Compare</Link>
              <a href="https://github.com/getcomputable/gpu-index" target="_blank" rel="noreferrer" className="text-mute hover:text-accent">Method</a>
            </nav>
          </div>
        </header>
        <div className="mx-auto max-w-[1180px] px-4 py-6 sm:px-6">{children}</div>
        <footer className="mx-auto max-w-[1180px] border-t border-hair px-4 py-6 text-xs leading-relaxed text-mute sm:px-6">
          Demo built by Vinil Polepalli - data: Computable GPU Index by Computable (mcp.getcomputable.com), published record at data.getcomputable.com and api.getcomputable.com, licensed CC-BY-NC-4.0; method: github.com/getcomputable/gpu-index (Apache-2.0). Snapshot timestamp shown. Independent tool; not affiliated with or endorsed by Computable. Not price advice.
        </footer>
      </body>
    </html>
  );
}
