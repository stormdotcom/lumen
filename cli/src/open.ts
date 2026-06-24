import { spawn } from "child_process";

export function openFile(absPath: string): void {
  try {
    if (process.platform === "win32") {
      spawn("cmd", ["/c", "start", "", absPath], { detached: true, stdio: "ignore" }).unref();
    } else if (process.platform === "darwin") {
      spawn("open", [absPath], { detached: true, stdio: "ignore" }).unref();
    } else {
      spawn("xdg-open", [absPath], { detached: true, stdio: "ignore" }).unref();
    }
  } catch {
    // best-effort — never crash the CLI
  }
}
