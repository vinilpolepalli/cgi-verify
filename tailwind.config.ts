import type { Config } from "tailwindcss";
export default {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Brand accent: deep bronze. Rationale: a market-terminal / ledger character suits an
        // index-verification tool; it sits outside the indigo/violet default band, is not the
        // cream+serif+sage pairing, and is distinct from sibling demos' navy/teal.
        accent: { DEFAULT: "#b45309", hover: "#92400e" },
        ground: "#fcfcfb",
        hair: "#e4e2de",
        ink: "#1c1917",
        mute: "#6b6560",
      },
      borderRadius: { btn: "8px", card: "10px" },
    },
  },
  plugins: [],
} satisfies Config;
