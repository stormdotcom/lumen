import * as fs from "fs";
import * as os from "os";
import * as path from "path";

function homeDir(): string {
  const h = os.homedir();
  if (h && h.length) return h;
  return process.env.USERPROFILE || process.env.HOME || process.cwd();
}

export function downloadsDir(): string {
  const platform = process.platform;
  let candidate: string;

  if (platform === "linux") {
    const xdg = process.env.XDG_DOWNLOAD_DIR;
    candidate = xdg && xdg.length ? xdg : path.join(homeDir(), "Downloads");
  } else {
    candidate = path.join(homeDir(), "Downloads");
  }

  try {
    fs.mkdirSync(candidate, { recursive: true });
    return candidate;
  } catch {
    return os.tmpdir();
  }
}

export function fileUrl(absPath: string): string {
  let p = absPath.split(path.sep).join("/");
  if (!p.startsWith("/")) p = "/" + p;
  return "file://" + encodeURI(p);
}
