import type { CoverageReport } from "@ajmal_n/lumen-core";

export interface OllamaProbe {
  available: boolean;
  url: string;
  models: string[];
  error?: string;
}

export interface SummarizeOptions {
  url?: string;
  model: string;
  signal?: AbortSignal;
  onDelta?: (delta: string) => void;
}

function baseUrl(): string {
  return (process.env.LUMEN_OLLAMA_URL || "http://localhost:11434").replace(/\/+$/, "");
}

export async function probeOllama(timeoutMs = 1200): Promise<OllamaProbe> {
  const url = baseUrl();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${url}/api/tags`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return { available: false, url, models: [], error: `HTTP ${res.status}` };
    const data = (await res.json()) as { models?: { name: string }[] };
    const models = (data.models || []).map((m) => m.name).filter(Boolean);
    return { available: true, url, models };
  } catch (err) {
    clearTimeout(timer);
    return { available: false, url, models: [], error: (err as Error).message };
  }
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

export async function summarize(prompt: string, opts: SummarizeOptions): Promise<string> {
  const url = (opts.url || baseUrl()).replace(/\/+$/, "");
  const body = {
    model: opts.model,
    stream: true,
    messages: [
      {
        role: "system",
        content:
          "You are a senior engineer reviewing a repository's test health. Be concise, specific, and actionable.",
      },
      { role: "user", content: prompt },
    ],
  };

  const res = await fetch(`${url}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: opts.signal,
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`Ollama HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
  }

  const reader = res.body.getReader();
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
      try {
        const obj = JSON.parse(line) as { message?: { content?: string }; done?: boolean };
        const delta = obj.message?.content || "";
        if (delta) {
          acc += delta;
          opts.onDelta?.(delta);
        }
      } catch {
        // skip malformed line
      }
    }
  }
  return acc.trim();
}

export function pickDefaultModel(models: string[]): string {
  const env = process.env.LUMEN_OLLAMA_MODEL;
  if (env && env.length) return env;
  const preferred = ["llama3.2", "llama3.1", "llama3", "qwen2.5", "mistral", "phi3"];
  for (const p of preferred) {
    const hit = models.find((m) => m.startsWith(p));
    if (hit) return hit;
  }
  return models[0] || "llama3.2";
}
