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
      try {
        const abs = path.resolve(val);
        if (!fs.existsSync(abs)) return `Path doesn't exist: ${abs}`;
        if (!fs.statSync(abs).isDirectory()) return `Not a directory: ${abs}`;
      } catch (err) {
        return `Invalid path: ${(err as Error).message}`;
      }
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

interface IterState {
  repoPath: string;
  testCmd: string;
  exit: boolean;
}

export async function runMenu(): Promise<void> {
  const p: Clack = await importEsm<Clack>("@clack/prompts");

  process.on("SIGTERM", () => process.exit(0));

  p.intro("lumen · interactive mode");

  const state: IterState = {
    repoPath: await promptRepoPath(p, process.cwd()),
    testCmd: "",
    exit: false,
  };
  state.testCmd = await promptTestCmd(p, state.repoPath);

  while (!state.exit) {
    try {
      await runIteration(p, state);
    } catch (err) {
      p.log.error(`Something went wrong: ${(err as Error)?.message ?? String(err)}`);
      const cont = await p.confirm({
        message: "Return to the menu?",
        initialValue: true,
      });
      if (p.isCancel(cont) || !cont) {
        state.exit = true;
      }
    }
  }
  p.outro("Bye.");
}

async function runIteration(p: Clack, state: IterState): Promise<void> {
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
    hint: state.repoPath,
  });
  choices.push({
    value: "change-cmd",
    label: "Change test command",
    hint: state.testCmd || "(none)",
  });
  choices.push({ value: "exit", label: "Exit" });

  const action = (await p.select({
    message: "What would you like to do?",
    options: choices.map((c) => ({ value: c.value, label: c.label, hint: c.hint })),
  })) as ActionValue | symbol;
  cancelIfNeeded(p, action);

  if (action === "exit") {
    state.exit = true;
    return;
  }

  if (action === "change-repo") {
    state.repoPath = await promptRepoPath(p, state.repoPath);
    state.testCmd = await promptTestCmd(p, state.repoPath, pkgTestScript(state.repoPath) || state.testCmd);
    return;
  }

  if (action === "change-cmd") {
    state.testCmd = await promptTestCmd(p, state.repoPath, state.testCmd);
    return;
  }

  if (action === "ai" && !availableProviders.length) {
    p.log.warn("No AI provider is configured.");
    p.log.message("Configure one of:");
    p.log.message("  • OPENAI_API_KEY=…   (for OpenAI)");
    p.log.message("  • ANTHROPIC_API_KEY=…  (for Anthropic)");
    p.log.message("  • `ollama serve` + `ollama pull llama3.2`  (for local Ollama)");
    return;
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

  const runTests = state.testCmd.length > 0 && action !== "scan-only";

  let testResult: { code: number; durationMs: number; stdout: string; stderr: string; truncated?: boolean } | null = null;
  if (runTests) {
    const spin = p.spinner();
    spin.start(`Running: ${state.testCmd}`);
    const ctrl = new AbortController();
    const onSigint = () => ctrl.abort();
    process.once("SIGINT", onSigint);
    try {
      const result = await runTestCommand(state.testCmd, {
        cwd: state.repoPath,
        signal: ctrl.signal,
        onChunk: (chunk) => {
          const tail = lastLines(chunk, 1);
          if (tail) spin.message(`Running: ${state.testCmd} — ${tail.slice(0, 80)}`);
        },
      });
      testResult = result;
      if (result.signaled || ctrl.signal.aborted) {
        spin.stop("Test run cancelled.", 1);
        return;
      }
      spin.stop(
        result.code === 0
          ? `Tests passed in ${(result.durationMs / 1000).toFixed(1)}s${result.truncated ? " (output truncated)" : ""}`
          : `Tests exited with code ${result.code} in ${(result.durationMs / 1000).toFixed(1)}s${result.truncated ? " (output truncated)" : ""}`,
        result.code === 0 ? 0 : 1,
      );
    } finally {
      process.removeListener("SIGINT", onSigint);
    }
  }

  const scanSpin = p.spinner();
  scanSpin.start("Scanning repository…");
  let stats;
  try {
    stats = scanRepo(state.repoPath);
  } catch (err) {
    scanSpin.stop(`Scan failed: ${(err as Error).message}`, 1);
    return;
  }
  const framework = (() => {
    try {
      return detectFramework(state.repoPath);
    } catch {
      return "unknown";
    }
  })();
  let coverage: CoverageReport | null = null;
  try {
    coverage = findCoverage(state.repoPath);
  } catch {
    coverage = null;
  }
  scanSpin.stop(
    coverage
      ? `Scan complete · ${stats.totalFiles.toLocaleString()} files · ${framework} · lines ${pct(coverage.total.lines.pct)}`
      : `Scan complete · ${stats.totalFiles.toLocaleString()} files · ${framework} · no coverage data found`,
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
        message: "Generate the report without AI analysis?",
        initialValue: true,
      });
      cancelIfNeeded(p, proceed);
      if (!proceed) return;
    }
  }

  if (action === "test-terminal") {
    p.note(formatTerminalSummary({ framework, stats, coverage, testResult }), "Result");
    return;
  }

  if (action === "scan-only") {
    p.note(formatTerminalSummary({ framework, stats, coverage, testResult: null }), "Scan");
    return;
  }

  if (action === "ai") {
    if (ai) p.note(ai.text, `AI Analysis · ${ai.model}`);
    return;
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

  try {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outFile, content, "utf8");
  } catch (err) {
    p.log.error(`Failed to write report: ${(err as Error).message}`);
    return;
  }

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

function formatTerminalSummary(args: {
  framework: string;
  stats: { totalFiles: number; totalLines: number; byExtension: { ext: string }[] };
  coverage: CoverageReport | null;
  testResult: { code: number; durationMs: number; stdout: string; stderr: string; truncated?: boolean } | null;
}): string {
  const lines: string[] = [];
  lines.push(`Framework: ${args.framework}`);
  lines.push(
    `Files    : ${args.stats.totalFiles.toLocaleString()} · LOC ${args.stats.totalLines.toLocaleString()} · ${args.stats.byExtension.length} extensions`,
  );
  if (args.testResult) {
    lines.push(
      `Tests    : exit ${args.testResult.code} in ${(args.testResult.durationMs / 1000).toFixed(1)}s${args.testResult.truncated ? " (output truncated)" : ""}`,
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
