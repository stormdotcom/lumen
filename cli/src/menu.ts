import * as fs from "fs";
import * as path from "path";
import {
  scanRepo,
  renderReport,
  renderMarkdown,
  findCoverage,
  detectFramework,
  CoverageReport,
  AiSummary,
} from "@ajmal_n/lumen-core";

import { downloadsDir, fileUrl } from "./paths";
import { runTestCommand, lastLines } from "./runner";
import { safeSlug, timestamp } from "./util";
import {
  probeAll,
  summarize,
  buildPrompt,
  pickDefaultModel,
  providerLabel,
  Provider,
  ProviderProbe,
} from "./ai";

type Clack = typeof import("@clack/prompts");

const importEsm: <T>(specifier: string) => Promise<T> = new Function(
  "s",
  "return import(s)",
) as <T>(specifier: string) => Promise<T>;

type ActionValue =
  | "test-terminal"
  | "test-html"
  | "test-md"
  | "scan-only"
  | "ai"
  | "change-repo"
  | "change-cmd"
  | "exit";

interface MenuChoice {
  value: ActionValue;
  label: string;
  hint?: string;
}

function pkgTestScript(dir: string): string | null {
  try {
    const raw = fs.readFileSync(path.join(dir, "package.json"), "utf8");
    const pkg = JSON.parse(raw) as { scripts?: Record<string, string> };
    const t = pkg.scripts?.test;
    if (t && t.trim() && !/no test specified/i.test(t)) return "npm test";
    return null;
  } catch {
    return null;
  }
}

function cancelIfNeeded(p: Clack, v: unknown): asserts v is Exclude<typeof v, symbol> {
  if (p.isCancel(v)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }
}

function pct(n: number) {
  return `${n.toFixed(1)}%`;
}

async function promptRepoPath(p: Clack, initial: string): Promise<string> {
  const v = await p.text({
    message: "Repository path",
    placeholder: initial,
    initialValue: initial,
    validate: (val) => {
      if (!val) return undefined;
      const abs = path.resolve(val);
      if (!fs.existsSync(abs)) return `Path doesn't exist: ${abs}`;
      if (!fs.statSync(abs).isDirectory()) return `Not a directory: ${abs}`;
      return undefined;
    },
  });
  cancelIfNeeded(p, v);
  return path.resolve(String(v || initial));
}

async function promptTestCmd(p: Clack, repoPath: string, initial?: string): Promise<string> {
  const detected = initial || pkgTestScript(repoPath) || "npm test";
  const v = await p.text({
    message: "Test command (leave blank to skip running tests)",
    placeholder: detected,
    initialValue: detected,
  });
  cancelIfNeeded(p, v);
  return String(v || "").trim();
}

export async function runMenu(): Promise<void> {
  const p: Clack = await importEsm<Clack>("@clack/prompts");

  process.on("SIGTERM", () => process.exit(0));

  p.intro("lumen · interactive mode");

  let repoPath = await promptRepoPath(p, process.cwd());
  let testCmd = await promptTestCmd(p, repoPath);

  while (true) {
    const outcome = await runIteration(p, repoPath, testCmd);
    if (outcome.exit) {
      p.outro("Bye.");
      return;
    }
    if (outcome.repoPath !== undefined) repoPath = outcome.repoPath;
    if (outcome.testCmd !== undefined) testCmd = outcome.testCmd;
  }
}

interface IterationOutcome {
  exit: boolean;
  repoPath?: string;
  testCmd?: string;
}

async function runIteration(
  p: Clack,
  repoPath: string,
  testCmd: string,
): Promise<IterationOutcome> {
  try {
    const probes = await probeAll();
    const availableProviders = probes.filter((pp) => pp.available);

    const choices: MenuChoice[] = [
      { value: "test-terminal", label: "Run tests · show summary in terminal" },
      { value: "test-html", label: "Run tests · generate HTML report" },
      { value: "test-md", label: "Run tests · generate Markdown report" },
      { value: "scan-only", label: "Scan only (skip running tests)" },
    ];
    if (availableProviders.length) {
      const names = availableProviders.map((pp) => providerLabel(pp.provider)).join(", ");
      choices.push({
        value: "ai",
        label: "AI analysis · summary + suggestions",
        hint: names,
      });
    } else {
      choices.push({
        value: "ai",
        label: "AI analysis (no provider configured)",
        hint: "set OPENAI_API_KEY / ANTHROPIC_API_KEY or run `ollama serve`",
      });
    }
    choices.push({
      value: "change-repo",
      label: "Change repository path",
      hint: repoPath,
    });
    choices.push({
      value: "change-cmd",
      label: "Change test command",
      hint: testCmd || "(none)",
    });
    choices.push({ value: "exit", label: "Exit" });

    const action = (await p.select({
      message: "What would you like to do?",
      options: choices.map((c) => ({ value: c.value, label: c.label, hint: c.hint })),
    })) as ActionValue | symbol;
    cancelIfNeeded(p, action);

    if (action === "exit") {
      p.outro("Bye.");
      return;
    }

    if (action === "change-repo") {
      repoPath = await promptRepoPath(p, repoPath);
      testCmd = await promptTestCmd(p, repoPath, pkgTestScript(repoPath) || testCmd);
      continue;
    }

    if (action === "change-cmd") {
      testCmd = await promptTestCmd(p, repoPath, testCmd);
      continue;
    }

    if (action === "ai" && !availableProviders.length) {
      p.log.warn("No AI provider is configured.");
      p.log.message("Configure one of:");
      p.log.message("  • OPENAI_API_KEY=…   (for OpenAI)");
      p.log.message("  • ANTHROPIC_API_KEY=…  (for Anthropic)");
      p.log.message("  • `ollama serve` + `ollama pull llama3.2`  (for local Ollama)");
      continue;
    }

    let aiProvider: Provider | undefined;
    let aiModel: string | undefined;
    if (action === "ai") {
      let chosen: ProviderProbe;
      if (availableProviders.length === 1) {
        chosen = availableProviders[0];
      } else {
        const providerChoice = await p.select({
          message: "Choose an AI provider",
          options: availableProviders.map((pp) => ({
            value: pp.provider,
            label: providerLabel(pp.provider),
            hint: pp.detail,
          })),
        });
        cancelIfNeeded(p, providerChoice);
        chosen = availableProviders.find((pp) => pp.provider === providerChoice)!;
      }
      aiProvider = chosen.provider;
      const def = pickDefaultModel(chosen.provider, chosen.models);
      const modelChoice = await p.select({
        message: `Choose a ${providerLabel(chosen.provider)} model`,
        initialValue: def,
        options: chosen.models.map((m) => ({ value: m, label: m })),
      });
      cancelIfNeeded(p, modelChoice);
      aiModel = String(modelChoice);
    }

    const runTests = testCmd.length > 0 && action !== "scan-only";

    let testResult: { code: number; durationMs: number; stdout: string; stderr: string } | null = null;
    if (runTests) {
      const spin = p.spinner();
      spin.start(`Running: ${testCmd}`);
      const ctrl = new AbortController();
      const onSigint = () => ctrl.abort();
      process.once("SIGINT", onSigint);
      try {
        const result = await runTestCommand(testCmd, {
          cwd: repoPath,
          signal: ctrl.signal,
          onChunk: (chunk) => {
            const tail = lastLines(chunk, 1);
            if (tail) spin.message(`Running: ${testCmd} — ${tail.slice(0, 80)}`);
          },
        });
        testResult = result;
        if (result.signaled || ctrl.signal.aborted) {
          spin.stop("Test run cancelled.", 1);
          continue;
        }
        spin.stop(
          result.code === 0
            ? `Tests passed in ${(result.durationMs / 1000).toFixed(1)}s`
            : `Tests exited with code ${result.code} in ${(result.durationMs / 1000).toFixed(1)}s`,
          result.code === 0 ? 0 : 1,
        );
      } finally {
        process.removeListener("SIGINT", onSigint);
      }
    }

    const scanSpin = p.spinner();
    scanSpin.start("Scanning repository…");
    const stats = scanRepo(repoPath);
    const framework = detectFramework(repoPath);
    let coverage: CoverageReport | null = null;
    try {
      coverage = findCoverage(repoPath);
    } catch {
      coverage = null;
    }
    scanSpin.stop(
      coverage
        ? `Scan complete · ${framework} · lines ${pct(coverage.total.lines.pct)}`
        : `Scan complete · ${framework} · no coverage data found`,
    );

    let ai: AiSummary | null = null;
    if (action === "ai" && aiProvider && aiModel) {
      const aiSpin = p.spinner();
      const label = `${providerLabel(aiProvider)} · ${aiModel}`;
      aiSpin.start(`Asking ${label}…`);
      let lastShown = "";
      const ctrl = new AbortController();
      const onSigint = () => ctrl.abort();
      process.once("SIGINT", onSigint);
      let aiFailed = false;
      try {
        const prompt = buildPrompt({
          repoName: stats.rootName,
          framework,
          totalFiles: stats.totalFiles,
          totalLines: stats.totalLines,
          coverage,
          testStdoutTail: testResult ? lastLines(testResult.stdout || testResult.stderr, 8) : undefined,
        });
        const text = await summarize({
          provider: aiProvider,
          model: aiModel,
          prompt,
          signal: ctrl.signal,
          onDelta: (delta) => {
            lastShown = (lastShown + delta).slice(-60);
            aiSpin.message(`Asking ${label} — ${lastShown.replace(/\s+/g, " ")}`);
          },
        });
        aiSpin.stop(`AI summary ready (${text.length} chars)`);
        ai = { model: `${providerLabel(aiProvider)} · ${aiModel}`, text };
      } catch (err) {
        aiFailed = true;
        aiSpin.stop(`AI summary failed: ${(err as Error).message}`, 1);
      } finally {
        process.removeListener("SIGINT", onSigint);
      }
      if (aiFailed) {
        const proceed = await p.confirm({
          message: "Generate the HTML report without AI analysis?",
          initialValue: true,
        });
        cancelIfNeeded(p, proceed);
        if (!proceed) continue;
      }
    }

    if (action === "test-terminal") {
      p.note(formatTerminalSummary({ framework, stats, coverage, testResult }), "Result");
      continue;
    }

    if (action === "scan-only") {
      p.note(formatTerminalSummary({ framework, stats, coverage, testResult: null }), "Scan");
      continue;
    }

    if (action === "ai") {
      if (ai) {
        p.note(ai.text, `AI Analysis · ${ai.model}`);
      }
      continue;
    }

    const format: "html" | "md" = action === "test-md" ? "md" : "html";
    const outDir = downloadsDir();
    const ext = format === "md" ? "md" : "html";
    const base = `lumen-${safeSlug(stats.rootName)}-${timestamp()}`;
    const outFile = path.join(outDir, `${base}.${ext}`);

    const content =
      format === "md"
        ? renderMarkdown(stats, { coverage, aiSummary: ai })
        : renderReport(stats, { coverage, aiSummary: ai });

    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outFile, content, "utf8");

    p.note(
      [
        `File: ${outFile}`,
        process.platform === "win32" ? `URL : ${fileUrl(outFile)}` : null,
        ai ? `AI  : ${ai.model}` : null,
        coverage ? `Cov : lines ${pct(coverage.total.lines.pct)} · functions ${pct(coverage.total.functions.pct)} · branches ${pct(coverage.total.branches.pct)}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      "Report written",
    );
  }
}

function formatTerminalSummary(args: {
  framework: string;
  stats: { totalFiles: number; totalLines: number; byExtension: { ext: string }[] };
  coverage: CoverageReport | null;
  testResult: { code: number; durationMs: number; stdout: string; stderr: string } | null;
}): string {
  const lines: string[] = [];
  lines.push(`Framework: ${args.framework}`);
  lines.push(
    `Files    : ${args.stats.totalFiles.toLocaleString()} · LOC ${args.stats.totalLines.toLocaleString()} · ${args.stats.byExtension.length} extensions`,
  );
  if (args.testResult) {
    lines.push(
      `Tests    : exit ${args.testResult.code} in ${(args.testResult.durationMs / 1000).toFixed(1)}s`,
    );
    const tail = lastLines(args.testResult.stdout || args.testResult.stderr, 3);
    if (tail) lines.push(`Output   : ${tail}`);
  }
  if (args.coverage) {
    const c = args.coverage;
    lines.push(
      `Coverage : lines ${pct(c.total.lines.pct)} · stmts ${pct(c.total.statements.pct)} · fns ${pct(c.total.functions.pct)} · brs ${pct(c.total.branches.pct)}  (${c.files.length} files)`,
    );
  } else {
    lines.push("Coverage : no report found (run with coverage flag e.g. `jest --coverage`)");
  }
  return lines.join("\n");
}
