#!/usr/bin/env node
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Command, Option } from "commander";
import { scanRepo, renderReport, renderMarkdown } from "@ajmal_n/lumen-core";

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

const program = new Command();

program
  .name("lumen")
  .description("Scan a repository and produce a self-contained insight report.")
  .version("0.2.0")
  .argument("[path]", "Path to the repository to scan", ".")
  .addOption(
    new Option("-f, --format <fmt>", "Output format")
      .choices(["html", "markdown", "md"])
      .default("html"),
  )
  .option("-o, --out <dir>", "Output directory for the report", defaultOutputDir())
  .option("-n, --name <name>", "Override the report filename (without extension)")
  .option("--print-path", "Print only the path to the generated report (machine-readable)")
  .action(
    (
      targetPath: string,
      opts: { format: string; out: string; name?: string; printPath?: boolean },
    ) => {
      const resolved = path.resolve(targetPath);
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
        console.error(`lumen: not a directory: ${resolved}`);
        process.exit(1);
      }

      let format: Format;
      try {
        format = normalizeFormat(opts.format);
      } catch (err) {
        console.error(`lumen: ${(err as Error).message}`);
        process.exit(1);
      }

      if (!opts.printPath) process.stdout.write(`Scanning ${resolved}...\n`);
      const stats = scanRepo(resolved);
      const content = format === "markdown" ? renderMarkdown(stats) : renderReport(stats);

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
    },
  );

program.parse(process.argv);
