export const PASS_FLAG_COPY =
  "pass = our reimplementation of the published method reproduces the published value and stability band from the published inputs. " +
  "flag = it does not, and the snapshot says why: either an input the method needs is missing from the published record (missing input), " +
  "or every input is present and the numbers still differ (numeric divergence). A flag is a reported fact with the exact inputs shown, not an accusation; " +
  "it can equally reflect a limit or bug in this reimplementation.";
export const STATUS_LABEL: Record<string, string> = { match: "reproduced", divergence: "numeric divergence", "missing-input": "missing input" };
