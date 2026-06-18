import type { CoverageReport, FileCoverage } from "@ajmal_n/lumen-core";

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
    ls += f.lines.total; lc += f.lines.covered;
    ss += f.statements.total; sc += f.statements.covered;
    fs += f.functions.total; fc += f.functions.covered;
    bs += f.branches.total; bc += f.branches.covered;
  }
  const p = (cov: number, tot: number) => (tot === 0 ? 100 : Math.round((cov / tot) * 1000) / 10);
  return {
    lines: { total: ls, covered: lc, pct: p(lc, ls) },
    statements: { total: ss, covered: sc, pct: p(sc, ss) },
    functions: { total: fs, covered: fc, pct: p(fc, fs) },
    branches: { total: bs, covered: bc, pct: p(bc, bs) },
  };
}

const BAR_WIDTH = 10;
const BAR_FILL = "█";
const BAR_EMPTY = "░";

export function coverageBar(pct: number): string {
  const filled = Math.round((pct / 100) * BAR_WIDTH);
  return BAR_FILL.repeat(filled) + BAR_EMPTY.repeat(BAR_WIDTH - filled);
}

export function coverageStatus(pct: number, threshold = 80): string {
  if (pct >= threshold) return "✓";
  if (pct >= threshold * 0.75) return "⚠";
  return "✗";
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
  const hr = "─".repeat(60);

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
    const bar = coverageBar(f.lines.pct);
    const status = coverageStatus(f.lines.pct, threshold);
    lines.push(`${label}  ${bar}  ${f.lines.pct.toFixed(1).padStart(5)}%  ${status}`);
  }

  lines.push(hr);
  const t = coverage.total;
  const totalBar = coverageBar(t.lines.pct);
  const totalStatus = coverageStatus(t.lines.pct, threshold);
  lines.push(
    `${"Total (changed files)".padEnd(col)}  ${totalBar}  ${t.lines.pct.toFixed(1).padStart(5)}%  ${totalStatus}`,
  );
  lines.push(`  lines: ${t.lines.covered}/${t.lines.total}  stmts: ${t.statements.covered}/${t.statements.total}  fns: ${t.functions.covered}/${t.functions.total}  branches: ${t.branches.covered}/${t.branches.total}`);

  if (threshold) {
    const pass = t.lines.pct >= threshold;
    lines.push("");
    lines.push(pass ? `✓ Passes ${threshold}% threshold` : `✗ Below ${threshold}% threshold (${t.lines.pct.toFixed(1)}% / ${threshold}%)`);
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

export type Format = "html" | "markdown";

export function normalizeFormat(input: string): Format {
  const v = input.toLowerCase();
  if (v === "md" || v === "markdown") return "markdown";
  if (v === "html" || v === "htm") return "html";
  throw new Error(`Unknown format: ${input}. Use 'html' or 'markdown'.`);
}

export function parseThreshold(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw new Error(`Invalid --threshold: ${raw}. Expected a number 0-100.`);
  }
  return n;
}
