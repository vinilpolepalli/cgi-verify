import { readFileSync } from "node:fs";
import { parseCorpus, FetchError } from "../lib/computable";
const raw = readFileSync(process.argv[2], "utf8");
const t = (name: string, mutate: (d: any) => void, rewriteDigest = false) => {
  const d = JSON.parse(raw); mutate(d);
  try { parseCorpus(JSON.stringify(d)); console.log(name, "-> ACCEPTED (BAD)"); }
  catch (e) { console.log(name, "->", e instanceof FetchError ? `${e.kind}: ${e.message.slice(0, 90)}` : String(e)); }
};
t("tampered price", (d) => { d.data.observations.at(-1).value_usd_gpu_hr += 0.01; });
t("bad license", (d) => { d.license.spdx = "MIT"; });
t("no envelope", (d) => { delete d.meta; });
try { parseCorpus("<html>"); } catch (e) { console.log("html ->", (e as FetchError).kind); }
