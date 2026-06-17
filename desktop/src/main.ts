import { app, BrowserWindow, ipcMain, dialog, shell, Menu } from "electron";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { spawn, ChildProcess } from "child_process";
import {
  scanRepo,
  renderReport,
  renderMarkdown,
  findCoverage,
  detectFramework,
  RepoStats,
  CoverageReport,
  AiSummary,
} from "@ajmal_n/lumen-core";

let mainWindow: BrowserWindow | null = null;

interface Settings {
  openaiApiKey: string;
  anthropicApiKey: string;
  ollamaUrl: string;
  defaultTestCommand: string;
  recentRepos: string[];
}

const DEFAULT_SETTINGS: Settings = {
  openaiApiKey: "",
  anthropicApiKey: "",
  ollamaUrl: "http://localhost:11434",
  defaultTestCommand: "npm test",
  recentRepos: [],
};

function settingsFile(): string {
  return path.join(app.getPath("userData"), "settings.json");
}

function readSettings(): Settings {
  try {
    const raw = fs.readFileSync(settingsFile(), "utf8");
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function writeSettings(s: Settings): void {
  try {
    fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
    fs.writeFileSync(settingsFile(), JSON.stringify(s, null, 2), "utf8");
  } catch {
    // ignore
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1340,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#f7f8fb",
    title: "Lumen",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("dialog:pick-directory", async (): Promise<string | null> => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Select repository",
    properties: ["openDirectory"],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle("repo:scan", async (_evt, dir: string): Promise<RepoStats> => {
  return scanRepo(dir);
});

ipcMain.handle(
  "repo:coverage",
  async (_evt, dir: string): Promise<{ framework: string; coverage: CoverageReport | null }> => {
    const framework = detectFramework(dir);
    let coverage: CoverageReport | null = null;
    try {
      coverage = findCoverage(dir);
    } catch {
      coverage = null;
    }
    return { framework, coverage };
  },
);

interface ExportArgs {
  stats: RepoStats;
  coverage: CoverageReport | null;
  ai: AiSummary | null;
  format: "html" | "markdown";
}

ipcMain.handle("report:export", async (_evt, args: ExportArgs): Promise<string | null> => {
  if (!mainWindow) return null;
  const ext = args.format === "markdown" ? "md" : "html";
  const slug = (args.stats.rootName || "repo").replace(/[^a-z0-9_-]+/gi, "-");
  const defaultName = `lumen-${slug}.${ext}`;
  const defaultPath = path.join(os.homedir(), "Downloads", defaultName);
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Save Lumen report",
    defaultPath,
    filters: [
      args.format === "markdown"
        ? { name: "Markdown", extensions: ["md"] }
        : { name: "HTML", extensions: ["html"] },
    ],
  });
  if (result.canceled || !result.filePath) return null;
  const content =
    args.format === "markdown"
      ? renderMarkdown(args.stats, { coverage: args.coverage, aiSummary: args.ai })
      : renderReport(args.stats, { coverage: args.coverage, aiSummary: args.ai });
  fs.writeFileSync(result.filePath, content, "utf8");
  return result.filePath;
});

ipcMain.handle("shell:reveal", async (_evt, filePath: string): Promise<void> => {
  shell.showItemInFolder(filePath);
});

ipcMain.handle("shell:open-path", async (_evt, p: string): Promise<void> => {
  await shell.openPath(p);
});

ipcMain.handle("settings:get", async (): Promise<Settings> => readSettings());

ipcMain.handle("settings:set", async (_evt, next: Partial<Settings>): Promise<Settings> => {
  const merged = { ...readSettings(), ...next };
  writeSettings(merged);
  return merged;
});

ipcMain.handle("settings:add-recent", async (_evt, dir: string): Promise<string[]> => {
  const cur = readSettings();
  const next = [dir, ...cur.recentRepos.filter((r) => r !== dir)].slice(0, 8);
  cur.recentRepos = next;
  writeSettings(cur);
  return next;
});

const runners = new Map<string, ChildProcess>();

ipcMain.handle(
  "tests:run",
  async (
    evt,
    args: { id: string; cmd: string; cwd: string },
  ): Promise<{ code: number; durationMs: number }> => {
    return new Promise((resolve) => {
      const start = Date.now();
      const child = spawn(args.cmd, {
        cwd: args.cwd,
        shell: true,
        env: { ...process.env, FORCE_COLOR: "0" },
        windowsHide: true,
      });
      runners.set(args.id, child);

      const send = (stream: "stdout" | "stderr", chunk: string) => {
        if (!evt.sender.isDestroyed()) {
          evt.sender.send("tests:chunk", { id: args.id, stream, chunk });
        }
      };
      child.stdout?.on("data", (b: Buffer) => send("stdout", b.toString("utf8")));
      child.stderr?.on("data", (b: Buffer) => send("stderr", b.toString("utf8")));
      child.on("error", (err) => send("stderr", `\n[lumen] ${err.message}\n`));
      child.on("close", (code, sig) => {
        runners.delete(args.id);
        resolve({
          code: typeof code === "number" ? code : sig ? 130 : 1,
          durationMs: Date.now() - start,
        });
      });
    });
  },
);

ipcMain.handle("tests:cancel", async (_evt, id: string): Promise<void> => {
  const c = runners.get(id);
  if (c) {
    try {
      c.kill("SIGTERM");
    } catch {
      // ignore
    }
  }
});

interface AiArgs {
  provider: "ollama" | "openai" | "anthropic";
  model: string;
  prompt: string;
  id: string;
}

ipcMain.handle("ai:probe", async (): Promise<
  { provider: string; available: boolean; models: string[]; hint?: string }[]
> => {
  const settings = readSettings();
  const out: { provider: string; available: boolean; models: string[]; hint?: string }[] = [];

  const ollamaUrl = settings.ollamaUrl.replace(/\/+$/, "");
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1200);
    const res = await fetch(`${ollamaUrl}/api/tags`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (res.ok) {
      const data = (await res.json()) as { models?: { name: string }[] };
      const models = (data.models || []).map((m) => m.name).filter(Boolean);
      out.push(
        models.length
          ? { provider: "ollama", available: true, models }
          : { provider: "ollama", available: false, models: [], hint: "no models installed" },
      );
    } else {
      out.push({ provider: "ollama", available: false, models: [], hint: `HTTP ${res.status}` });
    }
  } catch {
    out.push({
      provider: "ollama",
      available: false,
      models: [],
      hint: "not running",
    });
  }

  const openaiKey = settings.openaiApiKey || process.env.OPENAI_API_KEY || "";
  out.push({
    provider: "openai",
    available: !!openaiKey,
    models: openaiKey ? ["gpt-4o-mini", "gpt-4o", "o1-mini", "o1", "gpt-4-turbo"] : [],
    hint: openaiKey ? undefined : "set OPENAI_API_KEY in Settings",
  });

  const anthropicKey = settings.anthropicApiKey || process.env.ANTHROPIC_API_KEY || "";
  out.push({
    provider: "anthropic",
    available: !!anthropicKey,
    models: anthropicKey
      ? ["claude-haiku-4-5-20251001", "claude-sonnet-4-6", "claude-opus-4-7"]
      : [],
    hint: anthropicKey ? undefined : "set ANTHROPIC_API_KEY in Settings",
  });

  return out;
});

const aiControllers = new Map<string, AbortController>();

ipcMain.handle(
  "ai:summarize",
  async (evt, args: AiArgs): Promise<{ text: string }> => {
    const settings = readSettings();
    const ctrl = new AbortController();
    aiControllers.set(args.id, ctrl);

    const send = (delta: string) => {
      if (!evt.sender.isDestroyed()) {
        evt.sender.send("ai:delta", { id: args.id, delta });
      }
    };

    const SYSTEM =
      "You are a senior engineer reviewing a repository's test health. Be concise, specific, and actionable.";

    try {
      if (args.provider === "ollama") {
        const url = settings.ollamaUrl.replace(/\/+$/, "");
        const res = await fetch(`${url}/api/chat`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model: args.model,
            stream: true,
            messages: [
              { role: "system", content: SYSTEM },
              { role: "user", content: args.prompt },
            ],
          }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) throw new Error(`Ollama HTTP ${res.status}`);
        const text = await readJsonLines(res.body, send, (line) => {
          try {
            const o = JSON.parse(line) as { message?: { content?: string } };
            return o.message?.content || "";
          } catch {
            return "";
          }
        });
        return { text };
      }
      if (args.provider === "openai") {
        const key = settings.openaiApiKey || process.env.OPENAI_API_KEY || "";
        if (!key) throw new Error("OPENAI_API_KEY not configured");
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model: args.model,
            stream: true,
            messages: [
              { role: "system", content: SYSTEM },
              { role: "user", content: args.prompt },
            ],
          }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) {
          const t = await res.text().catch(() => "");
          throw new Error(`OpenAI HTTP ${res.status}${t ? `: ${t.slice(0, 200)}` : ""}`);
        }
        const text = await readSse(res.body, send, (data) => {
          if (data === "[DONE]") return "";
          try {
            const o = JSON.parse(data) as { choices?: { delta?: { content?: string } }[] };
            return o.choices?.[0]?.delta?.content || "";
          } catch {
            return "";
          }
        });
        return { text };
      }
      // anthropic
      const key = settings.anthropicApiKey || process.env.ANTHROPIC_API_KEY || "";
      if (!key) throw new Error("ANTHROPIC_API_KEY not configured");
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: args.model,
          max_tokens: 1024,
          stream: true,
          system: SYSTEM,
          messages: [{ role: "user", content: args.prompt }],
        }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const t = await res.text().catch(() => "");
        throw new Error(`Anthropic HTTP ${res.status}${t ? `: ${t.slice(0, 200)}` : ""}`);
      }
      const text = await readSse(res.body, send, (data) => {
        try {
          const o = JSON.parse(data) as { type?: string; delta?: { type?: string; text?: string } };
          if (o.type === "content_block_delta" && o.delta?.type === "text_delta") {
            return o.delta.text || "";
          }
          return "";
        } catch {
          return "";
        }
      });
      return { text };
    } finally {
      aiControllers.delete(args.id);
    }
  },
);

ipcMain.handle("ai:cancel", async (_evt, id: string): Promise<void> => {
  const c = aiControllers.get(id);
  if (c) c.abort();
});

async function readJsonLines(
  body: ReadableStream<Uint8Array>,
  onDelta: (s: string) => void,
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
      const d = extract(line);
      if (d) {
        acc += d;
        onDelta(d);
      }
    }
  }
  return acc.trim();
}

async function readSse(
  body: ReadableStream<Uint8Array>,
  onDelta: (s: string) => void,
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
      const d = extract(data);
      if (d) {
        acc += d;
        onDelta(d);
      }
    }
  }
  return acc.trim();
}
