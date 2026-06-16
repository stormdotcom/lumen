#!/usr/bin/env node
import * as fs from "fs";
import * as os from "os";
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

type Format = "html" | "markdown";

function defaultOutputDir(): string {
  return path.join(os.homedir(), "Downloads");
}

function safeSlug(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "repo";
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function normalizeFormat(input: string): Format {
  const v = input.toLowerCase();
  if (v === "md" || v === "markdown") return "markdown";
  if (v === "html" || v === "htm") return "html";
  throw new Error(`Unknown format: ${input}. Use 'html' or 'markdown'.`);
}

function parseThreshold(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw new Error(`Invalid --threshold: ${raw}. Expected a number 0-100.`);
  }
  return n;
}

const program = new Command();

program
  .name("lumen")
  .description(
    "Scan a repository and produce a self-contained insight report — with optional test-coverage breakdown.",
  )
  .version("0.3.0")
  .argument("[path]", "Path to the repository to scan", ".")
  .addOption(
    new Option("-f, --format <fmt>", "Output format")
      .choices(["html", "markdown", "md"])
      .default("html"),
  )
  .option("-o, --out <dir>", "Output directory for the report", defaultOutputDir())
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
      },
    ) => {
      const resolved = path.resolve(targetPath);
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
        console.error(`lumen: not a directory: ${resolved}`);
        process.exit(1);
      }

      let format: Format;
      let threshold: number | undefined;
      try {
        format = normalizeFormat(opts.format);
        threshold = parseThreshold(opts.threshold);
      } catch (err) {
        console.error(`lumen: ${(err as Error).message}`);
        process.exit(1);
      }

      const log = (msg: string) => {
        if (!opts.printPath) process.stdout.write(msg);
      };

      log(`Scanning ${resolved}...\n`);
      const stats = scanRepo(resolved);

      let coverage: CoverageReport | null = null;
      if (opts.coverage !== false) {
        const framework = detectFramework(resolved);
        log(`Detected test framework: ${framework}\n`);
        coverage = findCoverage(resolved, { coverageDir: opts.coverageDir });
        if (coverage) {
          log(
            `Coverage: lines ${coverage.total.lines.pct.toFixed(1)}% · functions ${coverage.total.functions.pct.toFixed(1)}% · branches ${coverage.total.branches.pct.toFixed(1)}% (${coverage.files.length} files)\n`,
          );
        } else {
          log(
            "No coverage report found. Run your test runner with coverage enabled (e.g. `jest --coverage`, `vitest run --coverage`, `nx test --coverage`).\n",
          );
        }
      }

      const content =
        format === "markdown"
          ? renderMarkdown(stats, { coverage, threshold })
          : renderReport(stats, { coverage, threshold });

      const outDir = path.resolve(opts.out);
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

      const ext = format === "markdown" ? "md" : "html";
      const base = opts.name
        ? safeSlug(opts.name)
        : `lumen-${safeSlug(stats.rootName)}-${timestamp()}`;
      const outFile = path.join(outDir, `${base}.${ext}`);
      fs.writeFileSync(outFile, content, "utf8");

      if (opts.printPath) {
        process.stdout.write(outFile + "\n");
      } else {
        process.stdout.write(`Report written: ${outFile}\n`);
        process.stdout.write(
          `  ${stats.totalFiles} files, ${stats.totalLines.toLocaleString()} lines, across ${stats.byExtension.length} extensions.\n`,
        );
      }

      if (coverage && typeof threshold === "number") {
        const linesPct = coverage.total.lines.pct;
        if (linesPct < threshold) {
          if (!opts.printPath) {
            process.stderr.write(
              `lumen: coverage ${linesPct.toFixed(1)}% is below threshold ${threshold}%\n`,
            );
          }
          process.exit(2);
        }
      }
    },
  );

program.parse(process.argv);
