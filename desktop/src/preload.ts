import { contextBridge, ipcRenderer } from "electron";
import type { RepoStats } from "@lumen/core";

const api = {
  pickDirectory: (): Promise<string | null> => ipcRenderer.invoke("dialog:pick-directory"),
  scanRepo: (dir: string): Promise<RepoStats> => ipcRenderer.invoke("repo:scan", dir),
  exportReport: (stats: RepoStats): Promise<string | null> => ipcRenderer.invoke("report:export", stats),
  reveal: (filePath: string): Promise<void> => ipcRenderer.invoke("shell:reveal", filePath),
};

contextBridge.exposeInMainWorld("lumen", api);

export type LumenApi = typeof api;
