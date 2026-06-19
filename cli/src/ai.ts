import * as fs from "fs";
import type { CoverageReport, FileCoverage } from "@ajmal_n/lumen-core";

export type Provider = "ollama" | "openai" | "anthropic";

export interface ProviderProbe {
  provider: Provider;
  available: boolean;
  models: string[];
  hint?: string;
  detail?: string;
}

export interface SummarizeArgs {
  provider: Provider;
  model: string;
  prompt: string;
  signal?: AbortSignal;
  onDelta?: (delta: string) => void;
}

const OPENAI_DEFAULT_MODELS = ["gpt-4o-mini", "gpt-4o", "o1-mini", "o1", "gpt-4-turbo"];
const ANTHROPIC_DEFAULT_MODELS = [
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-6",
  "claude-opus-4-7",
];

function ollamaUrl(): string {
  return (process.env.LUMEN_OLLAMA_URL || "http://localhost:11434").replace(/\/+$/, "");
}

function openaiUrl(): string {
  return (process.env.OPENAI_BASE_URL || "https://api.openai.com").replace(/\/+$/, "");
}

function anthropicUrl(): string {
  return (process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/+$/, "");
}

async function probeOllama(timeoutMs = 1200): Promise<ProviderProbe> {
  const url = ollamaUrl();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${url}/api/tags`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) {
      return {
        provider: "ollama",
        available: false,
        models: [],
        hint: `Ollama responded ${res.status}`,
        detail: url,
      };
    }
    const data = (await res.json()) as { models?: { name: string }[] };
    const models = (data.models || []).map((m) => m.name).filter(Boolean);
    if (!models.length) {
      return {
        provider: "ollama",
        available: false,
        models: [],
        hint: "Ollama is running but no models are installed (try `ollama pull llama3.2`)",
        detail: url,
      };
    }
    return { provider: "ollama", available: true, models, detail: url };
  } catch (err) {
    clearTimeout(timer);
    return {
      provider: "ollama",
      available: false,
      models: [],
      hint: "Ollama not reachable (start it with `ollama serve`)",
      detail: (err as Error).message,
    };
  }
}

function probeOpenAI(): ProviderProbe {
  const key = process.env.OPENAI_API_KEY;
  if (!key || !key.trim()) {
    return {
      provider: "openai",
      available: false,
      models: [],
      hint: "set OPENAI_API_KEY to enable",
    };
  }
  const env = process.env.LUMEN_OPENAI_MODEL;
  const models = env ? [env, ...OPENAI_DEFAULT_MODELS.filter((m) => m !== env)] : OPENAI_DEFAULT_MODELS;
  return { provider: "openai", available: true, models, detail: openaiUrl() };
}

function probeAnthropic(): ProviderProbe {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || !key.trim()) {
    return {
      provider: "anthropic",
      available: false,
      models: [],
      hint: "set ANTHROPIC_API_KEY to enable",
    };
  }
  const env = process.env.LUMEN_ANTHROPIC_MODEL;
  const models = env ? [env, ...ANTHROPIC_DEFAULT_MODELS.filter((m) => m !== env)] : ANTHROPIC_DEFAULT_MODELS;
  return { provider: "anthropic", available: true, models, detail: anthropicUrl() };
}

export async function probeAll(): Promise<ProviderProbe[]> {
  const [ollama] = await Promise.all([probeOllama()]);
  return [ollama, probeOpenAI(), probeAnthropic()];
}

export function providerLabel(p: Provider): string {
  if (p === "ollama") return "Ollama (local)";
  if (p === "openai") return "OpenAI";
  return "Anthropic";
}

export function pickDefaultModel(p: Provider, models: string[]): string {
  if (p === "ollama") {
    const env = process.env.LUMEN_OLLAMA_MODEL;
    if (env) return env;
    const preferred = ["llama3.2", "llama3.1", "llama3", "qwen2.5", "mistral", "phi3"];
    for (const pre of preferred) {
      const hit = models.find((m) => m.startsWith(pre));
      if (hit) return hit;
    }
    return models[0] || "llama3.2";
  }
  return models[0];
}

export function buildPrompt(args: {
  repoName: string;
  framework: string;
  totalFiles: number;
  totalLines: number;
  coverage: CoverageReport | null;
  testStdoutTail?: string;
}): string {
  const lines: string[] = [];
  lines.push(`Repository: ${args.repoName}`);
  lines.push(`Test framework: ${args.framework}`);
  lines.push(`Files scanned: ${args.totalFiles}, total LOC: ${args.totalLines}`);

  const cov = args.coverage;
  if (cov) {
    lines.push("");
    lines.push("Coverage totals:");
    lines.push(`- Lines: ${cov.total.lines.pct.toFixed(1)}% (${cov.total.lines.covered}/${cov.total.lines.total})`);
    lines.push(`- Statements: ${cov.total.statements.pct.toFixed(1)}%`);
    lines.push(`- Functions: ${cov.total.functions.pct.toFixed(1)}%`);
    lines.push(`- Branches: ${cov.total.branches.pct.toFixed(1)}%`);

    const worst = cov.files
      .slice()
      .sort((a, b) => a.lines.pct - b.lines.pct)
      .slice(0, 5);
    if (worst.length) {
      lines.push("");
      lines.push("Files with lowest line coverage:");
      for (const f of worst) {
        lines.push(`- ${f.path} — ${f.lines.pct.toFixed(1)}% lines, ${f.branches.pct.toFixed(1)}% branches`);
      }
    }
  } else {
    lines.push("");
    lines.push("No coverage report was found.");
  }

  if (args.testStdoutTail) {
    lines.push("");
    lines.push("Recent test output (tail):");
    lines.push(args.testStdoutTail);
  }

  lines.push("");
  lines.push(
    "Write a short, plain-language report for a developer:\n" +
      "1) A one-paragraph summary of the test health.\n" +
      "2) Three prioritized, concrete suggestions to improve coverage or reliability.\n" +
      "Keep it under 200 words. No code blocks. No preamble.",
  );

  return lines.join("\n");
}

export type TestGenFocus = "diff" | "flagged" | "low" | "ai-pick";

export interface FileCandidate {
  file: FileCoverage;
  reason: string;
}

export function selectCandidates(
  coverage: CoverageReport,
  focus: TestGenFocus[],
  changedFiles: string[],
  threshold: number,
): FileCandidate[] {
  const seen = new Set<string>();
  const out: FileCandidate[] = [];

  const add = (f: FileCoverage, reason: string) => {
    if (seen.has(f.path)) return;
    seen.add(f.path);
    out.push({ file: f, reason });
  };

  const normalize = (p: string) => p.replace(/\\/g, "/");
  const changedSet = new Set(changedFiles.map(normalize));

  if (focus.includes("diff") && changedFiles.length) {
    for (const f of coverage.files) {
      const fp = normalize(f.path);
      const hit = changedSet.has(fp) || [...changedSet].some((c) => fp.endsWith("/" + c) || c.endsWith("/" + fp));
      if (hit) add(f, "changed file");
    }
  }

  if (focus.includes("flagged")) {
    for (const f of coverage.files) {
      if (f.lines.pct < threshold) add(f, `below ${threshold}% threshold (${f.lines.pct.toFixed(1)}%)`);
    }
  }

  if (focus.includes("low")) {
    for (const f of coverage.files) {
      if (f.lines.pct < 30) add(f, `very low coverage (${f.lines.pct.toFixed(1)}%)`);
    }
  }

  return out;
}

export function buildFileRankingPrompt(args: {
  framework: string;
  coverage: CoverageReport;
  maxFiles?: number;
}): string {
  const max = args.maxFiles ?? 8;
  const lines: string[] = [];
  lines.push(`Test framework: ${args.framework}`);
  lines.push(`Total line coverage: ${args.coverage.total.lines.pct.toFixed(1)}%`);
  lines.push("");
  lines.push("Files sorted by impact on total coverage (lines uncovered, descending):");

  const byImpact = args.coverage.files
    .slice()
    .sort((a, b) => (b.lines.total - b.lines.covered) - (a.lines.total - a.lines.covered))
    .slice(0, 20);

  for (const f of byImpact) {
    const uncovered = f.lines.total - f.lines.covered;
    lines.push(
      `- ${f.path}: ${f.lines.pct.toFixed(1)}% lines, ${f.branches.pct.toFixed(1)}% branches, ${f.functions.pct.toFixed(1)}% functions, ${uncovered} uncovered lines`,
    );
  }

  lines.push("");
  lines.push(
    `Identify the top ${max} files where writing tests would have the highest impact on overall coverage. ` +
    `Consider: uncovered lines, branch complexity (low branch %), function coverage, and how central the file is likely to be. ` +
    `Reply with ONLY a JSON array of file paths, e.g. ["src/foo.ts","src/bar.ts"]. No explanation.`,
  );

  return lines.join("\n");
}

export async function pickHighImpactFiles(args: {
  provider: Provider;
  model: string;
  framework: string;
  coverage: CoverageReport;
  signal?: AbortSignal;
  maxFiles?: number;
}): Promise<string[]> {
  const prompt = buildFileRankingPrompt({ framework: args.framework, coverage: args.coverage, maxFiles: args.maxFiles });
  const raw = await summarize({ provider: args.provider, model: args.model, prompt, signal: args.signal });
  const match = raw.match(/\[[\s\S]*?\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]) as unknown;
    if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === "string");
  } catch { /* ignore */ }
  return [];
}

export function buildTestCasePrompt(args: {
  filePath: string;
  fileContent: string;
  framework: string;
  linePct: number;
  branchPct: number;
  fnPct: number;
  reason: string;
}): string {
  const lines: string[] = [];
  lines.push(`Test framework: ${args.framework}`);
  lines.push(`File: ${args.filePath}`);
  lines.push(`Current coverage — lines: ${args.linePct.toFixed(1)}%, branches: ${args.branchPct.toFixed(1)}%, functions: ${args.fnPct.toFixed(1)}%`);
  lines.push(`Reason selected: ${args.reason}`);
  lines.push("");
  lines.push("Source file:");
  lines.push("```");
  lines.push(args.fileContent.slice(0, 6000));
  if (args.fileContent.length > 6000) lines.push("// ... (truncated)");
  lines.push("```");
  lines.push("");
  lines.push(
    `Write comprehensive test cases using ${args.framework} that target the gaps in coverage. ` +
    `Focus on: uncovered branches, error paths, edge cases, and untested functions. ` +
    `Output ONLY the test file content. Use the same import style as the source. ` +
    `No explanation before or after the code block.`,
  );
  return lines.join("\n");
}

export async function generateTestCases(args: {
  provider: Provider;
  model: string;
  filePath: string;
  fileContent: string;
  framework: string;
  linePct: number;
  branchPct: number;
  fnPct: number;
  reason: string;
  signal?: AbortSignal;
  onDelta?: (delta: string) => void;
}): Promise<string> {
  const prompt = buildTestCasePrompt(args);
  return summarize({ provider: args.provider, model: args.model, prompt, signal: args.signal, onDelta: args.onDelta });
}

export function readSourceFile(absPath: string): string {
  try {
    return fs.readFileSync(absPath, "utf8");
  } catch {
    return "";
  }
}

export function resolveSourcePath(repoPath: string, filePath: string): string {
  const p = filePath.replace(/\\/g, "/");
  if (require("path").isAbsolute(p)) return p;
  return require("path").join(repoPath, p);
}

const SYSTEM_PROMPT =
  "You are a senior engineer reviewing a repository's test health. Be concise, specific, and actionable.";

export async function summarize(args: SummarizeArgs): Promise<string> {
  if (args.provider === "ollama") return summarizeOllama(args);
  if (args.provider === "openai") return summarizeOpenAI(args);
  return summarizeAnthropic(args);
}

async function summarizeOllama(args: SummarizeArgs): Promise<string> {
  const url = ollamaUrl();
  const body = {
    model: args.model,
    stream: true,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: args.prompt },
    ],
  };
  const res = await fetch(`${url}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: args.signal,
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`Ollama HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
  }
  return readJsonLines(res.body, args.onDelta, (line) => {
    try {
      const obj = JSON.parse(line) as { message?: { content?: string } };
      return obj.message?.content || "";
    } catch {
      return "";
    }
  });
}

async function summarizeOpenAI(args: SummarizeArgs): Promise<string> {
  const url = openaiUrl();
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  const body = {
    model: args.model,
    stream: true,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: args.prompt },
    ],
  };
  const res = await fetch(`${url}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
    signal: args.signal,
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenAI HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
  }
  return readSse(res.body, args.onDelta, (data) => {
    if (data === "[DONE]") return "";
    try {
      const obj = JSON.parse(data) as { choices?: { delta?: { content?: string } }[] };
      return obj.choices?.[0]?.delta?.content || "";
    } catch {
      return "";
    }
  });
}

async function summarizeAnthropic(args: SummarizeArgs): Promise<string> {
  const url = anthropicUrl();
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
  const body = {
    model: args.model,
    max_tokens: 1024,
    stream: true,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: args.prompt }],
  };
  const res = await fetch(`${url}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
    signal: args.signal,
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`Anthropic HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
  }
  return readSse(res.body, args.onDelta, (data) => {
    try {
      const obj = JSON.parse(data) as {
        type?: string;
        delta?: { type?: string; text?: string };
      };
      if (obj.type === "content_block_delta" && obj.delta?.type === "text_delta") {
        return obj.delta.text || "";
      }
      return "";
    } catch {
      return "";
    }
  });
}

async function readJsonLines(
  body: ReadableStream<Uint8Array>,
  onDelta: ((s: string) => void) | undefined,
  extract: (line: string) => string,
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buf = "";
  let acc = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split("\n");
    buf = parts.pop() || "";
    for (const part of parts) {
      const line = part.trim();
      if (!line) continue;
      const delta = extract(line);
      if (delta) {
        acc += delta;
        onDelta?.(delta);
      }
    }
  }
  return acc.trim();
}

async function readSse(
  body: ReadableStream<Uint8Array>,
  onDelta: ((s: string) => void) | undefined,
  extract: (data: string) => string,
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buf = "";
  let acc = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n")) !== -1) {
      const raw = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      const line = raw.replace(/\r$/, "");
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data) continue;
      const delta = extract(data);
      if (delta) {
        acc += delta;
        onDelta?.(delta);
      }
    }
  }
  return acc.trim();
}
