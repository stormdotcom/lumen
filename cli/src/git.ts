import { execSync } from "child_process";

function git(args: string, cwd: string): string {
  return execSync(`git ${args}`, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 10000,
  }).trim();
}

export function isGitRepo(cwd: string): boolean {
  try {
    git("rev-parse --git-dir", cwd);
    return true;
  } catch {
    return false;
  }
}

export function getCurrentBranch(cwd: string): string {
  try {
    return git("rev-parse --abbrev-ref HEAD", cwd);
  } catch {
    return "unknown";
  }
}

export function detectBaseBranch(cwd: string): string {
  for (const ref of ["origin/main", "origin/master", "main", "master"]) {
    try {
      git(`rev-parse --verify ${ref}`, cwd);
      return ref;
    } catch {
      // try next
    }
  }
  try {
    git("rev-parse HEAD~1", cwd);
    return "HEAD~1";
  } catch {
    return "";
  }
}

export interface ChangedFilesResult {
  files: string[];
  base: string;
  current: string;
}

export function getChangedFiles(cwd: string, base?: string): ChangedFilesResult {
  const current = getCurrentBranch(cwd);
  const resolvedBase = base || detectBaseBranch(cwd);
  if (!resolvedBase) return { files: [], base: resolvedBase, current };

  try {
    const mergeBase = git(`merge-base HEAD ${resolvedBase}`, cwd);
    const committed = git(`diff --name-only ${mergeBase}`, cwd);
    let uncommitted = "";
    try {
      uncommitted = git("diff --name-only HEAD", cwd);
    } catch {
      /* untracked / empty index */
    }
    const all = new Set(
      [...committed.split("\n"), ...uncommitted.split("\n")]
        .map((l) => l.replace(/\\/g, "/").trim())
        .filter(Boolean),
    );
    return { files: [...all].sort(), base: resolvedBase, current };
  } catch {
    try {
      const out = git(`diff --name-only ${resolvedBase}`, cwd);
      return {
        files: out.split("\n").map((l) => l.replace(/\\/g, "/").trim()).filter(Boolean).sort(),
        base: resolvedBase,
        current,
      };
    } catch {
      return { files: [], base: resolvedBase, current };
    }
  }
}
