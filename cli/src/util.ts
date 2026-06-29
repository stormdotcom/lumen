import type { CoverageReport, FileCoverage } from "@ajmal_n/lumen-core";
import { theme } from "./theme";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const minimatch = require("minimatch") as (path: string, pattern: string) => boolean;

export function filterCoverage(cov: CoverageReport, changedFiles: string[]): CoverageReport {
  const changedSet = new Set(changedFiles.map((f) => f.replace(/\\/g, "/")));
  const matched = cov.files.filter((f) => {
    const p = f.path.replace(/\\/g, "/");
    if (changedSet.has(p)) return true;
    for (const c of changedSet) {
      if (p.endsWith("/" + c) || c.endsWith("/" + p) || p === c) return true;
    }
    return false;
  });
  const total = sumMetrics(matched);
  return { ...cov, files: matched, total };
}

function sumMetrics(files: FileCoverage[]) {
  let ls = 0, lc = 0, ss = 0, sc = 0, fs = 0, fc = 0, bs = 0, bc = 0;
  for (const f of files) {
    if (f.lines.total > 0) { ls += f.lines.total; lc += f.lines.covered; }
    if (f.statements.total > 0) { ss += f.statements.total; sc += f.statements.covered; }
    if (f.functions.total > 0) { fs += f.functions.total; fc += f.functions.covered; }
    if (f.branches.total > 0) { bs += f.branches.total; bc += f.branches.covered; }
  }
  const p = (cov: number, tot: number) => (tot <= 0 ? 0 : Math.round((cov / tot) * 10000) / 100);
  return {
    lines: { total: ls, covered: lc, pct: p(lc, ls) },
    statements: { total: ss, covered: sc, pct: p(sc, ss) },
    functions: { total: fs, covered: fc, pct: p(fc, fs) },
    branches: { total: bs, covered: bc, pct: p(bc, bs) },
  };
}

/** Thin wrapper kept for backward compatibility — delegates to theme */
export function coverageBar(pct: number, threshold = 80): string {
  return theme.bar(pct, threshold);
}

/** Thin wrapper kept for backward compatibility — delegates to theme */
export function coverageStatus(pct: number, threshold = 80): string {
  return theme.status(pct, threshold);
}

export function formatDiffCoverageReport(opts: {
  base: string;
  current: string;
  changedFiles: string[];
  coverage: CoverageReport | null;
  threshold?: number;
}): string {
  const { base, current, changedFiles, coverage, threshold = 80 } = opts;
  const lines: string[] = [];
  const hr = theme.hr(60);

  lines.push(`Branch : ${current}  →  ${base}`);
  lines.push(`Changed: ${changedFiles.length} file${changedFiles.length !== 1 ? "s" : ""}`);

  if (!coverage || coverage.files.length === 0) {
    lines.push(hr);
    if (!coverage) {
      lines.push("No coverage data found. Run tests with --coverage first.");
    } else {
      lines.push("None of the changed files appear in coverage data.");
      lines.push("Changed files:");
      for (const f of changedFiles) lines.push(`  ${f}`);
    }
    return lines.join("\n");
  }

  const coveredChanged = coverage.files.length;
  lines.push(`Coverage data for ${coveredChanged} of ${changedFiles.length} changed file${changedFiles.length !== 1 ? "s" : ""}`);
  lines.push(hr);

  const maxPathLen = Math.max(...coverage.files.map((f) => f.path.length), 4);
  const col = Math.min(maxPathLen, 48);

  for (const f of coverage.files.slice().sort((a, b) => a.lines.pct - b.lines.pct)) {
    const label = f.path.length > col ? "…" + f.path.slice(-(col - 1)) : f.path.padEnd(col);
    const pctStr = theme.pct(f.lines.pct.toFixed(2).padStart(6) + "%", f.lines.pct, threshold);
    lines.push(`${label}  ${theme.bar(f.lines.pct, threshold)}  ${pctStr}  ${theme.status(f.lines.pct, threshold)}`);
  }

  lines.push(hr);
  const t = coverage.total;
  lines.push(
    `${"Total (changed files)".padEnd(col)}  ${theme.bar(t.lines.pct, threshold)}  ${theme.pct(t.lines.pct.toFixed(2).padStart(6) + "%", t.lines.pct, threshold)}  ${theme.status(t.lines.pct, threshold)}`,
  );
  lines.push(theme.dim(`  lines: ${t.lines.covered}/${t.lines.total}  stmts: ${t.statements.covered}/${t.statements.total}  fns: ${t.functions.covered}/${t.functions.total}  branches: ${t.branches.covered}/${t.branches.total}`));

  if (threshold) {
    const pass = t.lines.pct >= threshold;
    lines.push("");
    lines.push(
      pass
        ? theme.pass(`✓ Passes ${threshold}% threshold`)
        : theme.fail(`✗ Below ${threshold}% threshold (${t.lines.pct.toFixed(2)}% / ${threshold}%)`),
    );
  }

  return lines.join("\n");
}

export function formatFullCoverageReport(opts: {
  coverage: CoverageReport;
  threshold?: number;
}): string {
  const { coverage, threshold = 80 } = opts;
  const lines: string[] = [];
  const hr = theme.hr(60);
  const t = coverage.total;

  lines.push(theme.accent("Coverage"));
  lines.push(hr);

  const sorted = coverage.files.slice().sort((a, b) => a.lines.pct - b.lines.pct);
  const visible = sorted.slice(0, 30);
  const maxPathLen = Math.max(...visible.map((f) => f.path.length), 4);
  const col = Math.min(maxPathLen, 48);

  for (const f of visible) {
    const label = f.path.length > col ? "…" + f.path.slice(-(col - 1)) : f.path.padEnd(col);
    const pctStr = theme.pct(f.lines.pct.toFixed(2).padStart(6) + "%", f.lines.pct, threshold);
    lines.push(`${label}  ${theme.bar(f.lines.pct, threshold)}  ${pctStr}  ${theme.status(f.lines.pct, threshold)}`);
  }
  if (sorted.length > visible.length) {
    lines.push(theme.dim(`  …and ${sorted.length - visible.length} more files`));
  }

  lines.push(hr);
  const totalLabel = `Total (${coverage.files.length} file${coverage.files.length !== 1 ? "s" : ""})`.padEnd(col);
  lines.push(
    `${totalLabel}  ${theme.bar(t.lines.pct, threshold)}  ${theme.pct(t.lines.pct.toFixed(2).padStart(6) + "%", t.lines.pct, threshold)}  ${theme.status(t.lines.pct, threshold)}`,
  );
  lines.push(
    theme.dim(
      `  lines: ${t.lines.covered}/${t.lines.total}  stmts: ${t.statements.covered}/${t.statements.total}  fns: ${t.functions.covered}/${t.functions.total}  branches: ${t.branches.covered}/${t.branches.total}`,
    ),
  );

  if (coverage.excluded && coverage.excluded.length > 0) {
    lines.push(theme.dim(`  excluded from headline: ${coverage.excluded.length} file${coverage.excluded.length !== 1 ? "s" : ""} (tests + config)`));
  }
  if (coverage.untested && coverage.untested.count > 0) {
    lines.push(
      theme.dim(
        `  untested source files: ${coverage.untested.count} · ${coverage.untested.totalLines.toLocaleString()} lines (no coverage data)`,
      ),
    );
  }

  if (threshold) {
    const pass = t.lines.pct >= threshold;
    lines.push("");
    lines.push(
      pass
        ? theme.pass(`✓ Passes ${threshold}% threshold`)
        : theme.fail(`✗ Below ${threshold}% threshold (${t.lines.pct.toFixed(2)}% / ${threshold}%)`),
    );
  }

  return lines.join("\n");
}

export function safeSlug(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "repo";
}

export function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export type Format = "html" | "markdown" | "json";

export function normalizeFormat(input: string): Format {
  const v = input.toLowerCase();
  if (v === "md" || v === "markdown") return "markdown";
  if (v === "html" || v === "htm") return "html";
  if (v === "json") return "json";
  throw new Error(`Unknown format: ${input}. Use 'html', 'markdown', or 'json'.`);
}

export function formatUncoveredRanges(lines: number[]): string {
  if (lines.length === 0) return "";
  const sorted = [...lines].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0], end = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end + 1) {
      end = sorted[i];
    } else {
      ranges.push(start === end ? String(start) : `${start}-${end}`);
      start = end = sorted[i];
    }
  }
  ranges.push(start === end ? String(start) : `${start}-${end}`);
  return ranges.join(", ");
}

export interface ThresholdViolation {
  file: string;
  pattern: string;
  threshold: number;
  actual: number;
}

export function checkPerFileThresholds(
  files: FileCoverage[],
  thresholds: Record<string, number>,
): ThresholdViolation[] {
  const violations: ThresholdViolation[] = [];
  const patterns = Object.entries(thresholds);
  for (const file of files) {
    for (const [pattern, threshold] of patterns) {
      if (minimatch(file.path, pattern)) {
        if (file.lines.pct < threshold) {
          violations.push({ file: file.path, pattern, threshold, actual: file.lines.pct });
        }
        break;
      }
    }
  }
  return violations;
}

export function parseThreshold(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw new Error(`Invalid --threshold: ${raw}. Expected a number 0-100.`);
  }
  return n;
}
