import chalk from "chalk";

// Daltonize: swap green/red → blue/orange for red-green colorblind users
const daltonize =
  process.env.LUMEN_DALTONIZE === "1" || process.env.LUMEN_DALTONIZE === "true";

// Color palette — hex values only used here, never scattered across the codebase
const ACCENT = "#5EEAD4"; // teal — logo/header/section titles only
const LABEL  = "#E4E4E7"; // near-white — labels/headings
const DIM    = "#71717A"; // secondary — box-drawing, detail lines, empty bar segments
const PASS   = daltonize ? "#38BDF8" : "#4ADE80"; // blue (daltonize) | green
const WARN   = "#FBBF24"; // amber
const FAIL   = daltonize ? "#FB923C" : "#F87171"; // orange (daltonize) | red

const FILL  = "█";
const EMPTY = "░";

// Returns the chalk styler for pct vs threshold — callers apply it to pre-padded strings
function byStatus(pct: number, threshold: number): (s: string) => string {
  if (pct >= threshold)           return (s) => chalk.hex(PASS)(s);
  if (pct >= threshold * 0.75)   return (s) => chalk.hex(WARN)(s);
  return (s) => chalk.hex(FAIL)(s);
}

export const theme = {
  /** Teal accent — ONLY for Lumen logo/header and section titles */
  accent(s: string): string { return chalk.bold(chalk.hex(ACCENT)(s)); },

  /** Near-white — labels and headings */
  label(s: string): string { return chalk.hex(LABEL)(s); },

  /** Muted — box-drawing chars, threshold notes, detail lines */
  dim(s: string): string { return chalk.hex(DIM)(s); },

  /** Coverage pass color (green / blue-daltonize) */
  pass(s: string): string { return chalk.hex(PASS)(s); },

  /** Coverage warn color (amber) */
  warn(s: string): string { return chalk.hex(WARN)(s); },

  /** Coverage fail color (red / orange-daltonize) */
  fail(s: string): string { return chalk.hex(FAIL)(s); },

  /** Bold without color change */
  bold(s: string): string { return chalk.bold(s); },

  /**
   * Coverage status symbol, colored by pct vs threshold.
   * Symbols always render (✓ ⚠ ✗) — color is additive, not load-bearing.
   */
  status(pct: number, threshold = 80): string {
    const sym = pct >= threshold ? "✓" : pct >= threshold * 0.75 ? "⚠" : "✗";
    return byStatus(pct, threshold)(sym);
  },

  /**
   * Coverage bar. Filled segment colored by status; empty segment dimmed.
   * Apply padding to the percentage string BEFORE calling this; ANSI codes
   * do not affect visual column width.
   */
  bar(pct: number, threshold = 80, width = 10): string {
    const filled = Math.round((pct / 100) * width);
    const empty  = width - filled;
    const fillFn = byStatus(pct, threshold);
    return fillFn(FILL.repeat(filled)) + chalk.hex(DIM)(EMPTY.repeat(empty));
  },

  /**
   * Color a pre-padded percentage string by coverage status.
   * Always pad the numeric string first, then call this.
   */
  pct(s: string, pct: number, threshold = 80): string {
    return byStatus(pct, threshold)(s);
  },

  /** Dim horizontal rule */
  hr(len = 60): string { return chalk.hex(DIM)("─".repeat(len)); },
};
