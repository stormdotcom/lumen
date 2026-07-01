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
import { safeSlug, timestamp, filterCoverage, formatDiffCoverageReport } from "./util";
import { theme } from "./theme";
import { isGitRepo, getChangedFiles, detectBaseBranch, listBranches } from "./git";
import { loadConfig, saveConfig } from "./config";
import {
  probeAll,
  summarize,
  buildPrompt,
  loadRulesBundle,
  pickDefaultModel,
  providerLabel,
  Provider,
  ProviderProbe,
  selectCandidates,
  pickHighImpactFiles,
  generateTestCases,
  readSourceFile,
  resolveSourcePath,
  FileCandidate,
  TestGenFocus,
} from "./ai";

type Clack = typeof import("@clack/prompts");

const importEsm: <T>(specifier: string) => Promise<T> = new Function(
  "s",
  "return import(s)",
) as <T>(specifier: string) => Promise<T>;

type ActionValue =
  | "diff-coverage"
  | "test-terminal"
  | "test-html"
  | "test-md"
  | "scan-only"
  | "ai"
  | "change-repo"
  | "change-cmd"
  | "change-base"
  | "mcp-setup"
  | "hooks-setup"
  | "exit";

interface MenuChoice {
  value: ActionValue;
  label: string;
  hint?: string;
}

class BackToMenu extends Error {
  constructor() {
    super("BACK_TO_MENU");
    this.name = "BackToMenu";
  }
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

/**
 * Exits the app. Use only on the top-level main-menu prompt — Escape there
 * means the user wants to quit.
 */
function cancelIfNeeded(p: Clack, v: unknown): asserts v is Exclude<typeof v, symbol> {
  if (p.isCancel(v)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }
}

/**
 * Throws BackToMenu on cancel. Use in sub-prompts — Escape there means "go
 * back to the main menu", not "quit the app".
 */
function backIfCancelled(p: Clack, v: unknown): asserts v is Exclude<typeof v, symbol> {
  if (p.isCancel(v)) throw new BackToMenu();
}

function pct(n: number) {
  return `${n.toFixed(2)}%`;
}

async function promptRepoPath(p: Clack, initial: string, exitOnCancel = false): Promise<string> {
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
  if (exitOnCancel) cancelIfNeeded(p, v);
  else backIfCancelled(p, v);
  return path.resolve(String(v || initial));
}

async function promptTestCmd(p: Clack, repoPath: string, initial?: string, exitOnCancel = false): Promise<string> {
  const detected = initial || pkgTestScript(repoPath) || "npm test";
  const v = await p.text({
    message: "Test command (leave blank to skip running tests)",
    placeholder: detected,
    initialValue: detected,
  });
  if (exitOnCancel) cancelIfNeeded(p, v);
  else backIfCancelled(p, v);
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
    repoPath: await promptRepoPath(p, process.cwd(), true),
    testCmd: "",
    exit: false,
  };
  state.testCmd = await promptTestCmd(p, state.repoPath, undefined, true);

  while (!state.exit) {
    try {
      await runIteration(p, state);
    } catch (err) {
      if (err instanceof BackToMenu) {
        // User pressed Escape in a sub-prompt — just return to main menu.
        continue;
      }
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

  const isGit = isGitRepo(state.repoPath);
  const choices: MenuChoice[] = [];
  if (isGit) {
    choices.push({
      value: "diff-coverage",
      label: "Coverage check · changed files (diff vs base branch)",
      hint: "fast · shows only files you changed",
    });
  }
  choices.push(
    { value: "test-terminal", label: "Coverage check · all files (full project)" },
    { value: "test-html", label: "Run tests · generate HTML report" },
    { value: "test-md", label: "Run tests · generate Markdown report" },
    { value: "scan-only", label: "Scan only (skip running tests)" },
  );
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
  if (isGit) {
    const cfg = loadConfig(state.repoPath);
    const currentBase = cfg.baseBranch || detectBaseBranch(state.repoPath) || "(none)";
    choices.push({
      value: "change-base",
      label: "Change base branch (for diff coverage)",
      hint: currentBase,
    });
  }
  choices.push({
    value: "mcp-setup",
    label: "MCP · setup (expose Lumen to Claude Desktop / Cursor)",
    hint: "stdio MCP server",
  });
  if (isGit) {
    choices.push({
      value: "hooks-setup",
      label: "Hooks · setup (auto-run coverage gate on git push)",
      hint: "pre-push hook",
    });
  }
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

  if (action === "change-base") {
    await runChangeBaseBranch(p, state.repoPath);
    return;
  }

  if (action === "mcp-setup") {
    await runMcpSetup(p);
    return;
  }

  if (action === "hooks-setup") {
    await runHooksSetup(p, state.repoPath);
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
      backIfCancelled(p, providerChoice);
      chosen = availableProviders.find((pp) => pp.provider === providerChoice)!;
    }
    aiProvider = chosen.provider;
    const def = pickDefaultModel(chosen.provider, chosen.models);
    const modelChoice = await p.select({
      message: `Choose a ${providerLabel(chosen.provider)} model`,
      initialValue: def,
      options: chosen.models.map((m) => ({ value: m, label: m })),
    });
    backIfCancelled(p, modelChoice);
    aiModel = String(modelChoice);
  }

  let changedFiles: string[] = [];
  if (isGit) {
    try {
      changedFiles = getChangedFiles(state.repoPath).files;
    } catch { /* ignore */ }
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
    const cfg = loadConfig(state.repoPath);
    coverage = findCoverage(state.repoPath, {
      exclude: cfg.coverageExclude,
      includeTests: cfg.includeTests,
    });
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
        rules: loadRulesBundle(state.repoPath),
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
      backIfCancelled(p, proceed);
      if (!proceed) return;
    }
  }

  if (action === "diff-coverage") {
    const diffSpin = p.spinner();
    diffSpin.start("Detecting changed files…");
    let diffResult: Awaited<ReturnType<typeof getChangedFiles>>;
    try {
      diffResult = getChangedFiles(state.repoPath);
    } catch {
      diffResult = { files: [], base: "", current: "unknown" };
    }

    const noChanged = diffResult.files.length === 0;
    const filteredCov = !noChanged && coverage ? filterCoverage(coverage, diffResult.files) : null;
    const noMatchingCov = !noChanged && coverage && (!filteredCov || filteredCov.files.length === 0);

    if (noChanged) {
      diffSpin.stop(`No changed files detected vs ${diffResult.base || "base branch"} — showing full project coverage`);
      p.note(formatTerminalSummary({ framework, stats, coverage, testResult }), "Coverage (full project)");
    } else if (noMatchingCov) {
      diffSpin.stop(`${diffResult.files.length} changed files, but none found in coverage data — showing full project coverage`);
      p.log.warn("Changed files:\n" + diffResult.files.map((f) => `  ${f}`).join("\n"));
      p.note(formatTerminalSummary({ framework, stats, coverage, testResult }), "Coverage (full project)");
    } else {
      diffSpin.stop(`${diffResult.files.length} changed file${diffResult.files.length !== 1 ? "s" : ""} vs ${diffResult.base}`);
      const report = formatDiffCoverageReport({
        base: diffResult.base,
        current: diffResult.current,
        changedFiles: diffResult.files,
        coverage: filteredCov,
      });
      process.stdout.write("\n" + report + "\n\n");
    }

    if (coverage && availableProviders.length) {
      const wantGen = await p.confirm({ message: "Generate test cases for these files with AI?", initialValue: false });
      if (!p.isCancel(wantGen) && wantGen) {
        const { provider: prov, model: mod } = await promptProviderModel(p, availableProviders);
        if (prov && mod) await runTestGenFlow(p, state, coverage, framework, prov, mod, diffResult.files);
      }
    }
    return;
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
    if (ai) {
      printAiOutput(ai.text, ai.model);
      if (coverage && aiProvider && aiModel) {
        await runTestGenFlow(p, state, coverage, framework, aiProvider, aiModel, changedFiles);
      }
    }
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

  if (format === "md") {
    process.stdout.write("\n" + content + "\n");
  }

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

function printAiOutput(text: string, model: string): void {
  const hr = theme.hr(62);
  process.stdout.write("\n" + hr + "\n");
  process.stdout.write(theme.accent("  AI Analysis") + theme.dim(" · " + model) + "\n");
  process.stdout.write(hr + "\n\n");

  const paragraphs = text.split(/\n{2,}/);
  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;
    const isSuggestion = /^\d+[).]/.test(trimmed);
    if (isSuggestion) {
      const numbered = trimmed.split(/\n/).map((line) => {
        const match = line.match(/^(\d+[).]\s*)(.*)/s);
        if (match) return theme.bold(match[1]) + match[2];
        return line;
      });
      process.stdout.write(numbered.join("\n") + "\n\n");
    } else {
      process.stdout.write("  " + trimmed.replace(/\n/g, "\n  ") + "\n\n");
    }
  }

  process.stdout.write(hr + "\n\n");
}

async function promptProviderModel(
  p: Clack,
  availableProviders: ProviderProbe[],
): Promise<{ provider: Provider | undefined; model: string | undefined }> {
  let chosen: ProviderProbe;
  if (availableProviders.length === 1) {
    chosen = availableProviders[0];
  } else {
    const providerChoice = await p.select({
      message: "Choose an AI provider for test generation",
      options: availableProviders.map((pp) => ({
        value: pp.provider,
        label: providerLabel(pp.provider),
        hint: pp.detail,
      })),
    });
    if (p.isCancel(providerChoice)) return { provider: undefined, model: undefined };
    chosen = availableProviders.find((pp) => pp.provider === providerChoice)!;
  }
  const def = pickDefaultModel(chosen.provider, chosen.models);
  const modelChoice = await p.select({
    message: `Choose a ${providerLabel(chosen.provider)} model`,
    initialValue: def,
    options: chosen.models.map((m) => ({ value: m, label: m })),
  });
  if (p.isCancel(modelChoice)) return { provider: undefined, model: undefined };
  return { provider: chosen.provider, model: String(modelChoice) };
}

async function runTestGenFlow(
  p: Clack,
  state: IterState,
  coverage: CoverageReport,
  framework: string,
  aiProvider: Provider,
  aiModel: string,
  changedFiles: string[],
): Promise<void> {
  const wantGen = await p.confirm({
    message: "Generate test cases for coverage gaps?",
    initialValue: false,
  });
  if (p.isCancel(wantGen) || !wantGen) return;

  const THRESHOLD = 80;
  const focusOptions: { value: TestGenFocus; label: string; hint: string }[] = [];
  if (changedFiles.length) {
    focusOptions.push({ value: "diff", label: "Changed files only", hint: `${changedFiles.length} file${changedFiles.length !== 1 ? "s" : ""} vs base branch` });
  }
  const flaggedCount = coverage.files.filter((f) => f.lines.pct < THRESHOLD).length;
  if (flaggedCount) {
    focusOptions.push({ value: "flagged", label: `Flagged files (below ${THRESHOLD}% threshold)`, hint: `${flaggedCount} files` });
  }
  const lowCount = coverage.files.filter((f) => f.lines.pct < 30).length;
  if (lowCount) {
    focusOptions.push({ value: "low", label: "Very low coverage (< 30%)", hint: `${lowCount} files` });
  }
  focusOptions.push({ value: "ai-pick", label: "AI picks high-impact files", hint: "AI identifies where tests matter most" });

  const focusRaw = await p.multiselect({
    message: "Which files should we target?",
    options: focusOptions,
    required: true,
  });
  if (p.isCancel(focusRaw)) return;
  const focus = focusRaw as TestGenFocus[];

  let candidates = selectCandidates(coverage, focus.filter((f) => f !== "ai-pick"), changedFiles, THRESHOLD);

  if (focus.includes("ai-pick")) {
    const rankSpin = p.spinner();
    rankSpin.start(`Asking ${aiModel} to identify high-impact files…`);
    try {
      const ctrl = new AbortController();
      const onSigint = () => ctrl.abort();
      process.once("SIGINT", onSigint);
      const ranked = await pickHighImpactFiles({
        provider: aiProvider,
        model: aiModel,
        framework,
        coverage,
        signal: ctrl.signal,
        maxFiles: 8,
      });
      process.removeListener("SIGINT", onSigint);
      const seen = new Set(candidates.map((c) => c.file.path));
      for (const filePath of ranked) {
        const found = coverage.files.find((f) => f.path === filePath || f.path.endsWith("/" + filePath) || filePath.endsWith("/" + f.path));
        if (found && !seen.has(found.path)) {
          seen.add(found.path);
          candidates.push({ file: found, reason: "AI-identified high impact" });
        }
      }
      rankSpin.stop(`${ranked.length} high-impact files identified`);
    } catch (err) {
      rankSpin.stop(`AI ranking failed: ${(err as Error).message}`, 1);
    }
  }

  if (!candidates.length) {
    p.log.warn("No matching files found for the selected focus areas.");
    return;
  }

  const MAX_FILES = 10;
  if (candidates.length > MAX_FILES) {
    candidates = candidates
      .slice()
      .sort((a, b) => (a.file.lines.total - a.file.lines.covered) - (b.file.lines.total - b.file.lines.covered))
      .reverse()
      .slice(0, MAX_FILES);
    p.log.warn(`Limiting to top ${MAX_FILES} highest-impact files.`);
  }

  const fileChoices = await p.multiselect({
    message: `Select files to generate tests for (${framework})`,
    options: candidates.map((c) => ({
      value: c.file.path,
      label: c.file.path,
      hint: `${c.reason} · lines ${c.file.lines.pct.toFixed(2)}% · fns ${c.file.functions.pct.toFixed(2)}% · branches ${c.file.branches.pct.toFixed(2)}%`,
    })),
    required: true,
  });
  if (p.isCancel(fileChoices)) return;
  const selectedPaths = fileChoices as string[];

  const writeChoice = await p.select({
    message: "Output test cases to…",
    options: [
      { value: "console", label: "Console (print to terminal)" },
      { value: "file", label: "Write test files alongside source" },
      { value: "both", label: "Both" },
    ],
  });
  if (p.isCancel(writeChoice)) return;
  const outputMode = String(writeChoice) as "console" | "file" | "both";

  const testExt = deriveTestExt(framework);

  for (const filePath of selectedPaths) {
    const candidate = candidates.find((c) => c.file.path === filePath)!;
    const absPath = resolveSourcePath(state.repoPath, filePath);
    const fileContent = readSourceFile(absPath);
    if (!fileContent) {
      p.log.warn(`Could not read: ${filePath}`);
      continue;
    }

    const genSpin = p.spinner();
    genSpin.start(`Generating tests for ${path.basename(filePath)}…`);

    let generated = "";
    const ctrl = new AbortController();
    const onSigint = () => ctrl.abort();
    process.once("SIGINT", onSigint);

    try {
      generated = await generateTestCases({
        provider: aiProvider,
        model: aiModel,
        filePath,
        fileContent,
        framework,
        linePct: candidate.file.lines.pct,
        branchPct: candidate.file.branches.pct,
        fnPct: candidate.file.functions.pct,
        reason: candidate.reason,
        signal: ctrl.signal,
      });
      genSpin.stop(`Tests generated for ${path.basename(filePath)}`);
    } catch (err) {
      genSpin.stop(`Failed for ${path.basename(filePath)}: ${(err as Error).message}`, 1);
      process.removeListener("SIGINT", onSigint);
      continue;
    }
    process.removeListener("SIGINT", onSigint);

    const cleaned = stripCodeFence(generated);

    if (outputMode === "console" || outputMode === "both") {
      const hr = theme.hr(62);
      process.stdout.write("\n" + hr + "\n");
      process.stdout.write(theme.accent(`  Tests · ${filePath}`) + "\n");
      process.stdout.write(theme.dim(`  Reason: ${candidate.reason}`) + "\n");
      process.stdout.write(hr + "\n\n");
      process.stdout.write(cleaned + "\n\n");
    }

    if (outputMode === "file" || outputMode === "both") {
      const testPath = deriveTestPath(absPath, testExt);
      try {
        if (fs.existsSync(testPath)) {
          const overwrite = await p.confirm({ message: `Overwrite existing ${path.basename(testPath)}?`, initialValue: false });
          if (p.isCancel(overwrite) || !overwrite) {
            p.log.warn(`Skipped: ${testPath}`);
            continue;
          }
        }
        fs.writeFileSync(testPath, cleaned, "utf8");
        p.log.success(`Written: ${testPath}`);
      } catch (err) {
        p.log.error(`Failed to write ${testPath}: ${(err as Error).message}`);
      }
    }
  }
}

function deriveTestExt(framework: string): string {
  const fw = framework.toLowerCase();
  if (fw.includes("vitest") || fw.includes("jest") || fw.includes("mocha")) return ".test.ts";
  if (fw.includes("jasmine")) return ".spec.ts";
  if (fw.includes("pytest") || fw.includes("python")) return "_test.py";
  if (fw.includes("go")) return "_test.go";
  return ".test.ts";
}

function deriveTestPath(absSourcePath: string, testExt: string): string {
  const parsed = path.parse(absSourcePath);
  const base = parsed.name.replace(/\.(test|spec)$/, "");
  return path.join(parsed.dir, base + testExt);
}

function stripCodeFence(text: string): string {
  return text
    .replace(/^```[\w]*\n?/, "")
    .replace(/\n?```$/, "")
    .trim();
}

async function runChangeBaseBranch(p: Clack, repoPath: string): Promise<void> {
  const cfg = loadConfig(repoPath);
  const auto = detectBaseBranch(repoPath);
  const current = cfg.baseBranch || auto || "(none)";

  const branches = listBranches(repoPath);
  const recent = branches.slice(0, 12);

  const options: { value: string; label: string; hint?: string }[] = [];
  if (auto) options.push({ value: auto, label: auto, hint: "auto-detected" });
  for (const b of recent) {
    if (b === auto) continue;
    options.push({ value: b, label: b });
  }
  options.push({ value: "__custom__", label: "Type a custom branch name…" });
  options.push({ value: "__clear__", label: "Clear (use auto-detect)" });

  const choice = await p.select({
    message: `Base branch for diff coverage (current: ${current})`,
    options,
  });
  backIfCancelled(p, choice);

  let next: string | undefined;
  if (choice === "__clear__") {
    next = undefined;
  } else if (choice === "__custom__") {
    const typed = await p.text({
      message: "Branch name (e.g. origin/develop)",
      placeholder: auto || "origin/main",
      initialValue: cfg.baseBranch || "",
    });
    backIfCancelled(p, typed);
    next = String(typed || "").trim() || undefined;
  } else {
    next = String(choice);
  }

  try {
    saveConfig(repoPath, { ...cfg, baseBranch: next });
    p.log.success(next ? `Base branch set to ${next} (saved to lumen.config.json)` : "Base branch cleared (will auto-detect)");
  } catch (err) {
    p.log.error(`Could not save config: ${(err as Error).message}`);
  }
}

async function runMcpSetup(p: Clack): Promise<void> {
  const { getMcpInstallSnippet, getMcpToolList } = await import("./mcp");

  const choice = await p.select({
    message: "Lumen MCP server — what would you like to do?",
    options: [
      { value: "snippet", label: "Show install snippet (Claude Desktop / Cursor JSON)" },
      { value: "tools", label: "List the tools the server exposes" },
      { value: "claude-code", label: "Show `claude mcp add` command (Claude Code)" },
      { value: "test", label: "Test the server (runs `lumen mcp serve` briefly)" },
    ],
  });
  backIfCancelled(p, choice);

  if (choice === "snippet") {
    const snippet = getMcpInstallSnippet();
    p.log.message("Add this to your MCP host's config file:");
    p.log.message("  • Claude Desktop: %APPDATA%\\Claude\\claude_desktop_config.json (Win)  ~/Library/Application Support/Claude/claude_desktop_config.json (mac)");
    p.log.message("  • Cursor: ~/.cursor/mcp.json");
    p.log.message("\n" + snippet);
    return;
  }

  if (choice === "tools") {
    const tools = getMcpToolList();
    for (const t of tools) p.log.message(`• ${t.name} — ${t.description}`);
    return;
  }

  if (choice === "claude-code") {
    p.log.message("Run this in any shell:");
    p.log.message("  claude mcp add lumen -- lumen mcp serve");
    return;
  }

  if (choice === "test") {
    await runMcpSmokeTest(p);
    return;
  }
}

async function runMcpSmokeTest(p: Clack): Promise<void> {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");

  const entry = path.join(__dirname, "index.js");
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [entry, "mcp", "serve"],
  });
  const client = new Client(
    { name: "lumen-smoke-test", version: "0.11.0" },
    { capabilities: {} },
  );

  const started = Date.now();
  const timeoutMs = 8000;
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });

  try {
    await Promise.race([client.connect(transport), timeout]);
    const { tools } = await Promise.race([client.listTools(), timeout]);
    const elapsed = Date.now() - started;
    const names = tools.map((t) => t.name).join(", ");
    p.log.success(
      `Server responded in ${elapsed}ms — ${tools.length} tools (${names})`,
    );
  } catch (err) {
    p.log.error(`Smoke test failed — ${(err as Error).message}`);
  } finally {
    if (timer) clearTimeout(timer);
    try {
      await client.close();
    } catch {
      // transport may already be closed if the child crashed; ignore
    }
  }
}

async function runHooksSetup(p: Clack, repoPath: string): Promise<void> {
  const hooks = await import("./hooks");

  const choice = await p.select({
    message: "Lumen git hooks — what would you like to do?",
    options: [
      { value: "status", label: "Show current hook status" },
      { value: "install-prepush", label: "Install pre-push hook (recommended)" },
      { value: "install-precommit", label: "Install pre-commit hook" },
      { value: "uninstall", label: "Uninstall Lumen-owned hooks" },
    ],
  });
  backIfCancelled(p, choice);

  if (choice === "status") {
    try {
      const s = hooks.hookStatus(repoPath);
      p.log.message(`Hooks dir: ${s.hooksDir}`);
      p.log.message(`Threshold: ${s.threshold}% (${s.thresholdSource})`);
      for (const e of s.entries) {
        const tag =
          e.state === "ours" ? "installed (ours)" :
          e.state === "foreign" ? "present (not ours)" :
          "not installed";
        p.log.message(`  ${e.hook.padEnd(10)} ${tag}`);
      }
    } catch (err) {
      p.log.error((err as Error).message);
    }
    return;
  }

  if (choice === "install-prepush" || choice === "install-precommit") {
    const hook = choice === "install-precommit" ? "pre-commit" : "pre-push";
    try {
      const r = hooks.installHook(repoPath, { hook });
      p.log.success(`Installed ${r.hook} hook at ${r.hookPath}`);
      p.log.message('On run, the hook executes: lumen . --diff -t "${LUMEN_THRESHOLD:-80}"');
    } catch (err) {
      const msg = (err as Error).message;
      if (!msg.includes("--force")) {
        p.log.error(msg);
        return;
      }
      const overwrite = await p.confirm({
        message: `${msg}\nOverwrite the existing hook?`,
        initialValue: false,
      });
      if (overwrite !== true) {
        p.log.message("Cancelled.");
        return;
      }
      try {
        const r = hooks.installHook(repoPath, { hook, force: true });
        p.log.success(`Overwrote ${r.hook} hook at ${r.hookPath}`);
      } catch (err2) {
        p.log.error((err2 as Error).message);
      }
    }
    return;
  }

  if (choice === "uninstall") {
    try {
      const r = hooks.uninstallHooks(repoPath);
      if (r.removed.length === 0) {
        p.log.message("No Lumen-owned hooks were installed.");
      } else {
        p.log.success(`Removed: ${r.removed.join(", ")}`);
      }
      const foreign = r.skipped.filter((s) => s.reason === "foreign").map((s) => s.hook);
      if (foreign.length > 0) {
        p.log.message(`Left untouched (not ours): ${foreign.join(", ")}`);
      }
    } catch (err) {
      p.log.error((err as Error).message);
    }
    return;
  }
}
