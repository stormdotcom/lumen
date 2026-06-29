import { theme } from "./theme";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const MIN_INTERVAL_MS = 50;
const MAX_PATH = 60;

function truncatePath(p: string, max = MAX_PATH): string {
  if (p.length <= max) return p;
  return "…" + p.slice(-(max - 1));
}

export interface Progress {
  onFile(rel: string): void;
  stop(finalMessage?: string): void;
}

/**
 * Single-line spinner that updates with the current file being processed.
 * Writes to stderr so JSON / machine-readable output on stdout stays clean.
 * Falls back to silent no-op when stderr is not a TTY.
 */
export function startProgress(label: string): Progress {
  const isTTY = !!process.stderr.isTTY;
  if (!isTTY) {
    return { onFile: () => {}, stop: () => {} };
  }

  let count = 0;
  let current = "";
  let frame = 0;
  let lastRender = 0;
  let stopped = false;

  const render = () => {
    if (stopped) return;
    const line = `${theme.accent(FRAMES[frame])} ${theme.label(label)} ${theme.dim(`(${count.toLocaleString()})`)}${current ? "  " + theme.dim(truncatePath(current)) : ""}`;
    process.stderr.write("\r\x1b[2K" + line);
  };

  const interval = setInterval(() => {
    frame = (frame + 1) % FRAMES.length;
    render();
  }, 80);

  return {
    onFile(rel: string) {
      count++;
      current = rel;
      const now = Date.now();
      if (now - lastRender >= MIN_INTERVAL_MS) {
        lastRender = now;
        render();
      }
    },
    stop(finalMessage?: string) {
      if (stopped) return;
      stopped = true;
      clearInterval(interval);
      process.stderr.write("\r\x1b[2K");
      if (finalMessage) {
        process.stderr.write(theme.dim(finalMessage) + "\n");
      }
    },
  };
}
