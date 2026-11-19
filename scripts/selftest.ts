// Offline self-test: npx tsx scripts/selftest.ts <latest.json> [api-dir]
import { readFileSync } from "node:fs";
import { parseCorpus, compareApi } from "../lib/computable";
import { resultFor } from "../lib/method";
const d = parseCorpus(readFileSync(process.argv[2], "utf8"));
console.log("digest verified:", d.corpus?.digestVerified);
for (const [id, s] of Object.entries(d.skus)) {
  const r = resultFor(s);
  console.log(id, s.methodologyId, r.status, r.published, r.recomputed, s.publishedBand, r.recomputedBand, `voters ${r.voters} carried ${r.carried}`);
  if (process.argv[3]) console.log("  api:", compareApi(s, readFileSync(`${process.argv[3]}/api-${s.code}.json`, "utf8")));
}
