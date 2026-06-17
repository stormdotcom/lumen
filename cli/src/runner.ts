import { spawn } from "child_process";

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  signaled: boolean;
  truncated: boolean;
}

export interface RunOptions {
  cwd: string;
  signal?: AbortSignal;
  onChunk?: (chunk: string, stream: "stdout" | "stderr") => void;
  env?: NodeJS.ProcessEnv;
  /** Maximum captured output per stream, in bytes. Default 4 MB. */
  maxBufferBytes?: number;
}

const DEFAULT_MAX_BUFFER = 4 * 1024 * 1024;

function appendBounded(prev: string, addition: string, max: number): { next: string; truncated: boolean } {
  if (prev.length >= max) return { next: prev, truncated: true };
  const room = max - prev.length;
  if (addition.length <= room) return { next: prev + addition, truncated: false };
  return { next: prev + addition.slice(0, room), truncated: true };
}

export function runTestCommand(cmd: string, opts: RunOptions): Promise<RunResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    const maxBuf = opts.maxBufferBytes ?? DEFAULT_MAX_BUFFER;

    let child;
    try {
      child = spawn(cmd, {
        cwd: opts.cwd,
        shell: true,
        env: { ...process.env, ...(opts.env || {}), FORCE_COLOR: "0" },
        windowsHide: true,
      });
    } catch (err) {
      resolve({
        code: 1,
        stdout: "",
        stderr: `[lumen] failed to launch: ${(err as Error).message}`,
        durationMs: Date.now() - start,
        signaled: false,
        truncated: false,
      });
      return;
    }

    let stdout = "";
    let stderr = "";
    let signaled = false;
    let truncated = false;
    let settled = false;

    const onAbort = () => {
      signaled = true;
      try {
        child.kill("SIGTERM");
      } catch {
        // ignore
      }
    };
    if (opts.signal) {
      if (opts.signal.aborted) {
        onAbort();
      } else {
        opts.signal.addEventListener("abort", onAbort, { once: true });
      }
    }

    child.stdout?.on("data", (buf: Buffer) => {
      const s = buf.toString("utf8");
      const r = appendBounded(stdout, s, maxBuf);
      stdout = r.next;
      truncated = truncated || r.truncated;
      try {
        opts.onChunk?.(s, "stdout");
      } catch {
        // user callback shouldn't kill the run
      }
    });
    child.stderr?.on("data", (buf: Buffer) => {
      const s = buf.toString("utf8");
      const r = appendBounded(stderr, s, maxBuf);
      stderr = r.next;
      truncated = truncated || r.truncated;
      try {
        opts.onChunk?.(s, "stderr");
      } catch {
        // user callback shouldn't kill the run
      }
    });

    child.on("error", (err) => {
      const msg = `\n[lumen] process error: ${(err as Error).message}\n`;
      const r = appendBounded(stderr, msg, maxBuf);
      stderr = r.next;
    });

    const settle = (code: number | null, sig: NodeJS.Signals | null) => {
      if (settled) return;
      settled = true;
      if (opts.signal) opts.signal.removeEventListener("abort", onAbort);
      resolve({
        code: typeof code === "number" ? code : sig ? 130 : 1,
        stdout,
        stderr,
        durationMs: Date.now() - start,
        signaled: signaled || !!sig,
        truncated,
      });
    };

    child.on("close", settle);
    child.on("exit", settle);
  });
}

export function lastLines(text: string, n: number): string {
  if (!text) return "";
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const trimmed = lines.filter((l) => l.length > 0).slice(-n);
  return trimmed.join(" · ");
}
