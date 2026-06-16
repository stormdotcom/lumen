import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { scanRepo, renderReport, RepoStats } from "@lumen/core";

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
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

ipcMain.handle("report:export", async (_evt, stats: RepoStats): Promise<string | null> => {
  if (!mainWindow) return null;
  const defaultName = `lumen-${(stats.rootName || "repo").replace(/[^a-z0-9_-]+/gi, "-")}.html`;
  const defaultPath = path.join(os.homedir(), "Downloads", defaultName);
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Save Lumen report",
    defaultPath,
    filters: [{ name: "HTML", extensions: ["html"] }],
  });
  if (result.canceled || !result.filePath) return null;
  const html = renderReport(stats);
  fs.writeFileSync(result.filePath, html, "utf8");
  return result.filePath;
});

ipcMain.handle("shell:reveal", async (_evt, filePath: string): Promise<void> => {
  shell.showItemInFolder(filePath);
});
