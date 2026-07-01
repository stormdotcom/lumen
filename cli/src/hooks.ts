import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

import { isGitRepo } from "./git";
import { loadConfig } from "./config";

export type HookName = "pre-push" | "pre-commit";

const MARKER = "managed by @ajmal_n/lumen-cli";

const SCRIPT = `#!/bin/sh
# ${MARKER} (lumen hooks install) — do not edit by hand
# To uninstall: lumen hooks uninstall
exec lumen . --diff -t "\${LUMEN_THRESHOLD:-80}"
`;

export interface InstallOptions {
  hook?: HookName;
  force?: boolean;
}

export interface InstallResult {
  hook: HookName;
  hookPath: string;
  replaced: "none" | "ours" | "foreign";
}

export interface UninstallResult {
  removed: HookName[];
  skipped: { hook: HookName; reason: "missing" | "foreign" }[];
}

export type HookState = "none" | "ours" | "foreign";

export interface HookStatusEntry {
  hook: HookName;
  hookPath: string;
  state: HookState;
  firstLine?: string;
}

export interface HookStatus {
  hooksDir: string;
  threshold: number;
  thresholdSource: "config" | "default";
  entries: HookStatusEntry[];
}

function gitDir(root: string): string {
  const out = execSync("git rev-parse --git-dir", {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 10000,
  }).trim();
  return path.isAbsolute(out) ? out : path.join(root, out);
}

function hooksDirFor(root: string): string {
  return path.join(gitDir(root), "hooks");
}

function readState(hookPath: string): { state: HookState; firstLine?: string } {
  if (!fs.existsSync(hookPath)) return { state: "none" };
  try {
    const body = fs.readFileSync(hookPath, "utf8");
    const lines = body.split(/\r?\n/);
    const firstComment = lines.find((l) => l.trim().startsWith("#")) ?? "";
    if (firstComment.includes(MARKER)) {
      return { state: "ours", firstLine: firstComment };
    }
    return { state: "foreign", firstLine: lines[0] ?? "" };
  } catch {
    return { state: "foreign", firstLine: "(unreadable)" };
  }
}

function resolveThreshold(root: string): { value: number; source: "config" | "default" } {
  const cfg = loadConfig(root);
  if (typeof cfg.threshold === "number") return { value: cfg.threshold, source: "config" };
  return { value: 80, source: "default" };
}

export function installHook(root: string, opts: InstallOptions = {}): InstallResult {
  if (!isGitRepo(root)) throw new Error("Not a git repository.");
  const hook: HookName = opts.hook ?? "pre-push";
  const dir = hooksDirFor(root);
  fs.mkdirSync(dir, { recursive: true });

  const hookPath = path.join(dir, hook);
  const state = readState(hookPath);
  if (state.state === "foreign" && !opts.force) {
    const detail = state.firstLine ? ` First line: ${state.firstLine.trim()}` : "";
    throw new Error(
      `Refusing to overwrite existing ${hook} hook.${detail} Re-run with --force to replace it.`,
    );
  }

  fs.writeFileSync(hookPath, SCRIPT, { encoding: "utf8" });
  try {
    fs.chmodSync(hookPath, 0o755);
  } catch {
    // Windows filesystems ignore chmod; harmless.
  }

  return {
    hook,
    hookPath,
    replaced: state.state,
  };
}

export function uninstallHooks(root: string): UninstallResult {
  if (!isGitRepo(root)) throw new Error("Not a git repository.");
  const dir = hooksDirFor(root);
  const result: UninstallResult = { removed: [], skipped: [] };

  for (const hook of ["pre-push", "pre-commit"] as HookName[]) {
    const hookPath = path.join(dir, hook);
    const state = readState(hookPath);
    if (state.state === "none") {
      result.skipped.push({ hook, reason: "missing" });
      continue;
    }
    if (state.state === "foreign") {
      result.skipped.push({ hook, reason: "foreign" });
      continue;
    }
    fs.unlinkSync(hookPath);
    result.removed.push(hook);
  }

  return result;
}

export function hookStatus(root: string): HookStatus {
  if (!isGitRepo(root)) throw new Error("Not a git repository.");
  const dir = hooksDirFor(root);
  const threshold = resolveThreshold(root);

  const entries: HookStatusEntry[] = (["pre-push", "pre-commit"] as HookName[]).map((hook) => {
    const hookPath = path.join(dir, hook);
    const s = readState(hookPath);
    return { hook, hookPath, state: s.state, firstLine: s.firstLine };
  });

  return {
    hooksDir: dir,
    threshold: threshold.value,
    thresholdSource: threshold.source,
    entries,
  };
}
