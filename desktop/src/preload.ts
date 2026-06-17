import { contextBridge, ipcRenderer } from "electron";
import type { RepoStats, CoverageReport, AiSummary } from "@ajmal_n/lumen-core";

type Provider = "ollama" | "openai" | "anthropic";

interface Settings {
  openaiApiKey: string;
  anthropicApiKey: string;
  ollamaUrl: string;
  defaultTestCommand: string;
  recentRepos: string[];
}

const api = {
  pickDirectory: (): Promise<string | null> => ipcRenderer.invoke("dialog:pick-directory"),
  scanRepo: (dir: string): Promise<RepoStats> => ipcRenderer.invoke("repo:scan", dir),
  scanCoverage: (
    dir: string,
  ): Promise<{ framework: string; coverage: CoverageReport | null }> =>
    ipcRenderer.invoke("repo:coverage", dir),
  exportReport: (args: {
    stats: RepoStats;
    coverage: CoverageReport | null;
    ai: AiSummary | null;
    format: "html" | "markdown";
  }): Promise<string | null> => ipcRenderer.invoke("report:export", args),
  reveal: (filePath: string): Promise<void> => ipcRenderer.invoke("shell:reveal", filePath),
  openPath: (p: string): Promise<void> => ipcRenderer.invoke("shell:open-path", p),

  getSettings: (): Promise<Settings> => ipcRenderer.invoke("settings:get"),
  setSettings: (next: Partial<Settings>): Promise<Settings> =>
    ipcRenderer.invoke("settings:set", next),
  addRecent: (dir: string): Promise<string[]> => ipcRenderer.invoke("settings:add-recent", dir),

  runTests: (args: { id: string; cmd: string; cwd: string }): Promise<{ code: number; durationMs: number }> =>
    ipcRenderer.invoke("tests:run", args),
  cancelTests: (id: string): Promise<void> => ipcRenderer.invoke("tests:cancel", id),
  onTestChunk: (cb: (msg: { id: string; stream: "stdout" | "stderr"; chunk: string }) => void) => {
    const handler = (_e: unknown, msg: { id: string; stream: "stdout" | "stderr"; chunk: string }) =>
      cb(msg);
    ipcRenderer.on("tests:chunk", handler);
    return () => ipcRenderer.removeListener("tests:chunk", handler);
  },

  aiProbe: (): Promise<{ provider: Provider; available: boolean; models: string[]; hint?: string }[]> =>
    ipcRenderer.invoke("ai:probe"),
  aiSummarize: (args: {
    id: string;
    provider: Provider;
    model: string;
    prompt: string;
  }): Promise<{ text: string }> => ipcRenderer.invoke("ai:summarize", args),
  aiCancel: (id: string): Promise<void> => ipcRenderer.invoke("ai:cancel", id),
  onAiDelta: (cb: (msg: { id: string; delta: string }) => void) => {
    const handler = (_e: unknown, msg: { id: string; delta: string }) => cb(msg);
    ipcRenderer.on("ai:delta", handler);
    return () => ipcRenderer.removeListener("ai:delta", handler);
  },
};

contextBridge.exposeInMainWorld("lumen", api);

export type LumenApi = typeof api;
