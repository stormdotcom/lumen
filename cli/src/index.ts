#!/usr/bin/env node
import * as fs from "fs";
import * as path from "path";
import { Command, Option } from "commander";
import {
  scanRepo,
  renderReport,
  renderMarkdown,
  findCoverage,
  detectFramework,
  CoverageReport,
} from "@ajmal_n/lumen-core";

import { downloadsDir } from "./paths";
import {
  safeSlug,
  timestamp,
  normalizeFormat,
  parseThreshold,
  filterCoverage,
  formatDiffCoverageReport,
  formatUncoveredRanges,
  checkPerFileThresholds,
  Format,
} from "./util";
import { isGitRepo, getChangedFiles } from "./git";
import { loadConfig } from "./config";
import { loadSnapshot, saveSnapshot, compareSnapshot } from "./snapshot";
import { openFile } from "./open";

const VERSION = "0.9.1";

function printUncoveredLines(coverage: CoverageReport): void {
  for (const f of coverage.files) {
    if (f.uncoveredLines && f.uncoveredLines.length > 0) {
      process.stdout.write(`${f.path}: lines ${formatUncoveredRanges(f.uncoveredLines)}\n`);
    }
  }
}

const program = new Command();

program
  .name("lumen")
  .description(
    "Scan a repository and produce a self-contained insight report — with optional test-coverage breakdown.",
  )
  .version(VERSION)
  .argument("[path]", "Path to the repository to scan", ".")
  .addOption(
    new Option("-f, --format <fmt>", "Output format")
      .choices(["html", "markdown", "md", "json"])
      .default("html"),
  )
  .option("-o, --out <dir>", "Output directory for the report", downloadsDir())
  .option("-n, --name <name>", "Override the report filename (without extension)")
  .option("--print-path", "Print only the path to the generated report (machine-readable)")
  .option(
    "--coverage-dir <dir>",
    "Path to a coverage directory (e.g. ./coverage). Auto-discovered if omitted.",
  )
  .option("--no-coverage", "Skip test-coverage detection")
  .option(
    "-t, --threshold <pct>",
    "Fail (non-zero exit) if total line coverage is below this percent",
  )
  .option(
    "--diff [base]",
    "Check coverage only for files changed since base branch (default: auto-detect origin/main or origin/master). Pass --all to check all files instead.",
  )
  .option(
    "--all",
    "Check coverage for all files in the project (overrides --diff)",
  )
  .option("--json", "Print coverage and repo data as JSON to stdout (machine-readable)")
  .option("--open", "Open the generated report file with the default OS viewer")
  .option(
    "--fail-on-decrease",
    "Exit 2 if any coverage metric dropped since the last saved snapshot (.lumen/snapshot.json)",
  )
  .option("--show-uncovered", "Print uncovered line ranges per file (requires lcov.info)")
  .action(
    (
      targetPath: string,
      opts: {
        format: string;
        out: string;
        name?: string;
        printPath?: boolean;
        coverageDir?: string;
        coverage?: boolean;
        threshold?: string;
        diff?: string | boolean;
        all?: boolean;
        json?: boolean;
        open?: boolean;
        failOnDecrease?: boolean;
        showUncovered?: boolean;
      },
    ) => {
      const resolved = path.resolve(targetPath);
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
        console.error(`lumen: not a directory: ${resolved}`);
        process.exit(1);
      }

      const config = loadConfig(resolved);

      // CLI flags override config; use getOptionValueSource to detect explicit CLI flags
      const fmtSource = program.getOptionValueSource("format");
      const effectiveFormatStr = fmtSource === "cli" ? opts.format : (config.format ?? opts.format);

      const thresholdSource = program.getOptionValueSource("threshold");
      const effectiveThresholdStr =
        thresholdSource === "cli"
          ? opts.threshold
          : config.threshold !== undefined
            ? String(config.threshold)
            : opts.threshold;

      const outSource = program.getOptionValueSource("out");
      const effectiveOut = outSource === "cli" ? opts.out : (config.outputDir ?? opts.out);

      let format: Format;
      let threshold: number | undefined;
      try {
        format = normalizeFormat(effectiveFormatStr);
        threshold = parseThreshold(effectiveThresholdStr);
      } catch (err) {
        console.error(`lumen: ${(err as Error).message}`);
        process.exit(1);
      }

      const log = (msg: string) => {
        if (!opts.printPath && !opts.json) process.stdout.write(msg);
      };

      const isDiffMode = !opts.all && opts.diff !== undefined;

      if (isDiffMode) {
        const base =
          typeof opts.diff === "string"
            ? opts.diff
            : (config.baseBranch ?? undefined);
        const gitAvailable = isGitRepo(resolved);

        if (!gitAvailable) {
          process.stderr.write(
            "lumen: not a git repository — running full project coverage check instead\n\n",
          );
        }

        let coverage: CoverageReport | null = null;
        if (opts.coverage !== false) {
          coverage = findCoverage(resolved, { coverageDir: opts.coverageDir });
        }

        if (gitAvailable) {
          log("Detecting changed files…\n");
          let changedFiles: string[] = [];
          let resolvedBase = "";
          let current = "unknown";
          try {
            const git = getChangedFiles(resolved, base);
            changedFiles = git.files;
            resolvedBase = git.base;
            current = git.current;
          } catch {
            process.stderr.write("lumen: git diff failed — falling back to full coverage\n\n");
          }

          if (changedFiles.length === 0) {
            process.stderr.write(
              `lumen: no changed files detected vs ${resolvedBase || "base branch"} — showing full project coverage\n\n`,
            );
          } else {
            log(`Branch : ${current} → ${resolvedBase}\n`);
            log(`Changed: ${changedFiles.length} file${changedFiles.length !== 1 ? "s" : ""}\n`);
            const filteredCov = coverage ? filterCoverage(coverage, changedFiles) : null;
            const hasCovForDiff = filteredCov && filteredCov.files.length > 0;
            if (!hasCovForDiff) {
              process.stderr.write(
                "lumen: no coverage data found for changed files — showing full project coverage\n\n",
              );
            } else {
              if (opts.showUncovered) printUncoveredLines(filteredCov);
              const report = formatDiffCoverageReport({
                base: resolvedBase,
                current,
                changedFiles,
                coverage: filteredCov,
                threshold,
              });
              process.stdout.write("\n" + report + "\n");
              if (coverage) saveSnapshot(resolved, filteredCov.total);
              if (opts.failOnDecrease && coverage) {
                const snap = loadSnapshot(resolved);
                if (snap) {
                  const drops = compareSnapshot(snap, filteredCov.total);
                  if (drops.length > 0) {
                    for (const d of drops) {
                      process.stderr.write(
                        `lumen: coverage decreased: ${d.metric} ${d.before.toFixed(2)}% → ${d.after.toFixed(2)}%\n`,
                      );
                    }
                    process.exit(2);
                  }
                }
              }
              if (typeof threshold === "number" && filteredCov.total.lines.pct < threshold) {
                process.exit(2);
              }
              if (config.thresholds) {
                const violations = checkPerFileThresholds(filteredCov.files, config.thresholds);
                if (violations.length > 0) {
                  for (const v of violations) {
                    process.stderr.write(
                      `lumen: ${v.file}: lines ${v.actual.toFixed(2)}% below per-file threshold ${v.threshold}% (pattern: ${v.pattern})\n`,
                    );
                  }
                  process.exit(2);
                }
              }
              return;
            }
          }
        }

        // fallback: full project coverage output
        log("Scanning " + resolved + "...\n");
        const framework = detectFramework(resolved);
        log(`Detected test framework: ${framework}\n`);
        if (coverage) {
          log(`Coverage: lines ${coverage.total.lines.pct.toFixed(2)}% · functions ${coverage.total.functions.pct.toFixed(2)}% · branches ${coverage.total.branches.pct.toFixed(2)}% (${coverage.files.length} files)\n`);
          if (coverage.untested && coverage.untested.count > 0) {
            log(`Untested: ${coverage.untested.count} source file${coverage.untested.count !== 1 ? "s" : ""} · ${coverage.untested.totalLines.toLocaleString()} lines (no coverage data)\n`);
          }
          if (opts.showUncovered) printUncoveredLines(coverage);
        } else {
          log("No coverage report found.\n");
        }
        if (coverage && typeof threshold === "number" && coverage.total.lines.pct < threshold) {
          process.stderr.write(`lumen: coverage ${coverage.total.lines.pct.toFixed(2)}% is below threshold ${threshold}%\n`);
          process.exit(2);
        }
        return;
      }

      log(`Scanning ${resolved}...\n`);
      const stats = scanRepo(resolved);

      let coverage: CoverageReport | null = null;
      if (opts.coverage !== false) {
        const framework = detectFramework(resolved);
        log(`Detected test framework: ${framework}\n`);
        coverage = findCoverage(resolved, { coverageDir: opts.coverageDir });
        if (coverage) {
          log(
            `Coverage: lines ${coverage.total.lines.pct.toFixed(2)}% · functions ${coverage.total.functions.pct.toFixed(2)}% · branches ${coverage.total.branches.pct.toFixed(2)}% (${coverage.files.length} files)\n`,
          );
          if (coverage.untested && coverage.untested.count > 0) {
            log(
              `Untested: ${coverage.untested.count} source file${coverage.untested.count !== 1 ? "s" : ""} · ${coverage.untested.totalLines.toLocaleString()} lines (no coverage data)\n`,
            );
          }
        } else {
          log(
            "No coverage report found. Run your test runner with coverage enabled (e.g. `jest --coverage`, `vitest run --coverage`).\n",
          );
        }
      }

      if (opts.showUncovered && coverage) printUncoveredLines(coverage);

      // --json: print to stdout and exit
      if (opts.json) {
        process.stdout.write(
          JSON.stringify({ coverage, stats, timestamp: new Date().toISOString() }, null, 2) + "\n",
        );
        return;
      }

      let content: string;
      let ext: string;
      if (format === "json") {
        content = JSON.stringify({ coverage, stats, timestamp: new Date().toISOString() }, null, 2);
        ext = "json";
      } else if (format === "markdown") {
        content = renderMarkdown(stats, { coverage, threshold });
        ext = "md";
      } else {
        content = renderReport(stats, { coverage, threshold });
        ext = "html";
      }

      const outDir = path.resolve(effectiveOut);
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

      const outBase = opts.name
        ? safeSlug(opts.name)
        : `lumen-${safeSlug(stats.rootName)}-${timestamp()}`;
      const outFile = path.join(outDir, `${outBase}.${ext}`);
      fs.writeFileSync(outFile, content, "utf8");

      if (opts.printPath) {
        process.stdout.write(outFile + "\n");
      } else {
        process.stdout.write(`Report written: ${outFile}\n`);
        process.stdout.write(
          `  ${stats.totalFiles} files, ${stats.totalLines.toLocaleString()} lines, across ${stats.byExtension.length} extensions.\n`,
        );
      }

      if (opts.open) openFile(outFile);

      if (coverage) {
        if (opts.failOnDecrease) {
          const snap = loadSnapshot(resolved);
          if (snap) {
            const drops = compareSnapshot(snap, coverage.total);
            if (drops.length > 0) {
              for (const d of drops) {
                process.stderr.write(
                  `lumen: coverage decreased: ${d.metric} ${d.before.toFixed(2)}% → ${d.after.toFixed(2)}%\n`,
                );
              }
              process.exit(2);
            }
          }
        }
        saveSnapshot(resolved, coverage.total);
      }

      if (coverage && typeof threshold === "number") {
        const linesPct = coverage.total.lines.pct;
        if (linesPct < threshold) {
          if (!opts.printPath) {
            process.stderr.write(
              `lumen: coverage ${linesPct.toFixed(2)}% is below threshold ${threshold}%\n`,
            );
          }
          process.exit(2);
        }
      }

      if (config.thresholds && coverage) {
        const violations = checkPerFileThresholds(coverage.files, config.thresholds);
        if (violations.length > 0) {
          for (const v of violations) {
            process.stderr.write(
              `lumen: ${v.file}: lines ${v.actual.toFixed(2)}% below per-file threshold ${v.threshold}% (pattern: ${v.pattern})\n`,
            );
          }
          process.exit(2);
        }
      }
    },
  );

process.on("uncaughtException", (err) => {
  process.stderr.write(`\nlumen: unexpected error — ${(err as Error).message}\n`);
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  process.stderr.write(`\nlumen: unhandled rejection — ${msg}\n`);
  process.exit(1);
});

const noArgs = process.argv.length <= 2;
const isInteractive = !!process.stdout.isTTY && !!process.stdin.isTTY;

if (noArgs && isInteractive) {
  import("./menu")
    .then((m) => m.runMenu())
    .catch((err) => {
      console.error(`lumen: ${(err as Error).message}`);
      process.exit(1);
    });
} else {
  program.parse(process.argv);
}
