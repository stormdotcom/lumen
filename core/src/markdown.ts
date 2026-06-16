import { RepoStats } from "./scanner";
import { CoverageReport, CoverageMetric } from "./coverage";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function escapeCell(s: string): string {
  return s.replace(/\|/g, "\\|");
}

function fmtMetric(m: CoverageMetric): string {
  return `${m.pct.toFixed(1)}% (${m.covered.toLocaleString()} / ${m.total.toLocaleString()})`;
}

function coverageEmoji(pct: number, threshold?: number): string {
  const t = threshold ?? 80;
  if (pct >= t) return ":white_check_mark:";
  if (pct >= t * 0.75) return ":warning:";
  return ":x:";
}

export interface RenderMarkdownOptions {
  coverage?: CoverageReport | null;
  threshold?: number;
}

export function renderMarkdown(stats: RepoStats, options: RenderMarkdownOptions = {}): string {
  const avgSize = stats.totalFiles ? Math.round(stats.totalBytes / stats.totalFiles) : 0;
  const avgLines = stats.totalFiles ? Math.round(stats.totalLines / stats.totalFiles) : 0;

  const lines: string[] = [];

  lines.push(`# Lumen Report — ${stats.rootName}`);
  lines.push("");
  lines.push(`> **Repository:** \`${stats.root}\`  `);
  lines.push(`> **Scanned:** ${stats.scannedAt}`);
  lines.push("");

  lines.push("## Summary");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("| --- | ---: |");
  lines.push(`| Total files | ${stats.totalFiles.toLocaleString()} |`);
  lines.push(`| Total size | ${formatBytes(stats.totalBytes)} (avg ${formatBytes(avgSize)} / file) |`);
  lines.push(`| Lines of code | ${stats.totalLines.toLocaleString()} (avg ${avgLines.toLocaleString()} / file) |`);
  lines.push(`| Distinct extensions | ${stats.byExtension.length} |`);
  lines.push(`| Ignored directories | ${stats.ignored.length} |`);
  lines.push("");

  if (stats.notableFiles.length) {
    lines.push("## Notable files");
    lines.push("");
    for (const n of stats.notableFiles) {
      lines.push(`- **${escapeCell(n.name)}** — \`${escapeCell(n.relPath)}\` (${formatBytes(n.size)})`);
    }
    lines.push("");
  }

  lines.push("## File types");
  lines.push("");
  lines.push("| Extension | Files | Size | Lines |");
  lines.push("| --- | ---: | ---: | ---: |");
  for (const e of stats.byExtension.slice(0, 20)) {
    lines.push(
      `| \`${escapeCell(e.ext)}\` | ${e.files} | ${formatBytes(e.bytes)} | ${e.lines.toLocaleString()} |`,
    );
  }
  lines.push("");

  if (stats.topDirectories.length) {
    lines.push("## Top directories");
    lines.push("");
    lines.push("| Directory | Files | Size |");
    lines.push("| --- | ---: | ---: |");
    for (const d of stats.topDirectories) {
      lines.push(`| \`${escapeCell(d.dir)}\` | ${d.files} | ${formatBytes(d.bytes)} |`);
    }
    lines.push("");
  }

  if (stats.largestFiles.length) {
    lines.push("## Largest files");
    lines.push("");
    lines.push("| Path | Size |");
    lines.push("| --- | ---: |");
    for (const f of stats.largestFiles) {
      lines.push(`| \`${escapeCell(f.relPath)}\` | ${formatBytes(f.size)} |`);
    }
    lines.push("");
  }

  if (stats.ignored.length) {
    lines.push("<details>");
    lines.push("<summary>Ignored directories</summary>");
    lines.push("");
    for (const i of stats.ignored) {
      lines.push(`- \`${escapeCell(i)}\``);
    }
    lines.push("");
    lines.push("</details>");
    lines.push("");
  }

  const cov = options.coverage;
  if (cov) {
    lines.push(`## Test coverage — ${cov.framework}`);
    lines.push("");
    if (typeof options.threshold === "number") {
      const passed = cov.total.lines.pct >= options.threshold;
      lines.push(
        `> **Threshold:** ${options.threshold}% — ${passed ? ":white_check_mark: passed" : ":x: failed"} (lines ${cov.total.lines.pct.toFixed(1)}%)`,
      );
      lines.push("");
    }
    lines.push("| Metric | Coverage |");
    lines.push("| --- | ---: |");
    lines.push(`| Lines | ${coverageEmoji(cov.total.lines.pct, options.threshold)} ${fmtMetric(cov.total.lines)} |`);
    lines.push(`| Statements | ${coverageEmoji(cov.total.statements.pct, options.threshold)} ${fmtMetric(cov.total.statements)} |`);
    lines.push(`| Functions | ${coverageEmoji(cov.total.functions.pct, options.threshold)} ${fmtMetric(cov.total.functions)} |`);
    lines.push(`| Branches | ${coverageEmoji(cov.total.branches.pct, options.threshold)} ${fmtMetric(cov.total.branches)} |`);
    lines.push("");

    const worst = cov.files
      .slice()
      .sort((a, b) => a.lines.pct - b.lines.pct)
      .slice(0, 30);
    if (worst.length) {
      lines.push("### Files with lowest line coverage");
      lines.push("");
      lines.push("| File | Lines | Statements | Functions | Branches |");
      lines.push("| --- | ---: | ---: | ---: | ---: |");
      for (const f of worst) {
        lines.push(
          `| \`${escapeCell(f.path)}\` | ${f.lines.pct.toFixed(1)}% | ${f.statements.pct.toFixed(1)}% | ${f.functions.pct.toFixed(1)}% | ${f.branches.pct.toFixed(1)}% |`,
        );
      }
      lines.push("");
    }

    if (cov.sources.length) {
      lines.push(`> Sources: ${cov.sources.map((s) => `\`${escapeCell(s)}\``).join(", ")}`);
      lines.push("");
    }
  }

  lines.push("---");
  lines.push("");
  lines.push("_Generated by [lumen](https://www.npmjs.com/package/@ajmal_n/lumen-cli)._");

  return lines.join("\n") + "\n";
}
