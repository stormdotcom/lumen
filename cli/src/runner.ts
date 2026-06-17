import { spawn } from "child_process";

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  signaled: boolean;
}

export interface RunOptions {
  cwd: string;
  signal?: AbortSignal;
  onChunk?: (chunk: string, stream: "stdout" | "stderr") => void;
  env?: NodeJS.ProcessEnv;
}

export function runTestCommand(cmd: string, opts: RunOptions): Promise<RunResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    const child = spawn(cmd, {
      cwd: opts.cwd,
      shell: true,
      env: { ...process.env, ...(opts.env || {}), FORCE_COLOR: "0" },
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let signaled = false;

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
      stdout += s;
      opts.onChunk?.(s, "stdout");
    });
    child.stderr?.on("data", (buf: Buffer) => {
      const s = buf.toString("utf8");
      stderr += s;
      opts.onChunk?.(s, "stderr");
    });

    child.on("error", (err) => {
      stderr += `\n[lumen] failed to launch: ${(err as Error).message}\n`;
    });

    child.on("close", (code, sig) => {
      if (opts.signal) opts.signal.removeEventListener("abort", onAbort);
      resolve({
        code: typeof code === "number" ? code : sig ? 130 : 1,
        stdout,
        stderr,
        durationMs: Date.now() - start,
        signaled: signaled || !!sig,
      });
    });
  });
}

export function lastLines(text: string, n: number): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const trimmed = lines.filter((l) => l.length > 0).slice(-n);
  return trimmed.join(" · ");
}
