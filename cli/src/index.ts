#!/usr/bin/env node
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Command } from "commander";
import { scanRepo, renderReport } from "lumen-core";

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

const program = new Command();

program
  .name("lumen")
  .description("Scan a repository and produce a self-contained HTML insight report.")
  .version("0.1.0")
  .argument("[path]", "Path to the repository to scan", ".")
  .option("-o, --out <dir>", "Output directory for the HTML report", defaultOutputDir())
  .option("-n, --name <name>", "Override the report filename (without extension)")
  .option("--print-path", "Print only the path to the generated report (machine-readable)")
  .action((targetPath: string, opts: { out: string; name?: string; printPath?: boolean }) => {
    const resolved = path.resolve(targetPath);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
      console.error(`lumen: not a directory: ${resolved}`);
      process.exit(1);
    }

    if (!opts.printPath) process.stdout.write(`Scanning ${resolved}...\n`);
    const stats = scanRepo(resolved);
    const html = renderReport(stats);

    const outDir = path.resolve(opts.out);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const base = opts.name ? safeSlug(opts.name) : `lumen-${safeSlug(stats.rootName)}-${timestamp()}`;
    const outFile = path.join(outDir, `${base}.html`);
    fs.writeFileSync(outFile, html, "utf8");

    if (opts.printPath) {
      process.stdout.write(outFile + "\n");
    } else {
      process.stdout.write(`Report written: ${outFile}\n`);
      process.stdout.write(`  ${stats.totalFiles} files, ${stats.totalLines.toLocaleString()} lines, across ${stats.byExtension.length} extensions.\n`);
    }
  });

program.parse(process.argv);
