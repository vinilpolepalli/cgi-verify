# Wording correction: neutral mismatch framing

Review correction: a mismatch under our assumed estimators does NOT prove Computable's index has a reproducibility defect - the exact published estimator is not visible to us, so any mismatch is a limit of THIS demo's verification, not a finding about Computable. Fix all copy that implies otherwise.

1. Snapshot detail: replace "Recompute does not reproduce the published print; the gap is real, not hidden" with neutral language, e.g.: "Recomputed value under the assumed estimator differs from the published print by more than this tool's 0.5% tolerance. The published methodology does not expose its exact estimator in the payload, so this is a mismatch under an assumption, not a verification of CGI's correctness." Keep the candidate-estimator table.
2. SKU chips and log RESULT column: keep pass/flag mechanics but the flag tooltip/footnote must say flag = mismatch under the assumed estimator, unknown estimator is a limit of this demo.
3. Log page footnote and methodology panel: keep the PARSED / ASSUMED / COULD NOT BE VERIFIED structure; ensure the verdict wording everywhere is "candidate-estimator comparison", never "verification failure" of CGI.
4. Check README and IMPLEMENTATION.md for the same overclaim and fix.
5. Keep every number, the candidates, and the parsed/assumed/unverified distinctions exactly as they are - this is a framing fix only.
6. Rebuild, re-run scanner, retake /tmp/cgi2-detail.png and /tmp/cgi2-log.png from the running app. Do not deploy or push.
