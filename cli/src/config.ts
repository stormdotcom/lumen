import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

export interface LumenConfig {
  threshold?: number;
  baseBranch?: string;
  testCommand?: string;
  outputDir?: string;
  format?: "html" | "markdown" | "json";
  thresholds?: Record<string, number>;
  // Glob patterns to exclude from the headline coverage aggregation, on top of
  // the automatic test-file exclusion. Supports `*` (single segment) and `**`
  // (any path). Example: ["src/legacy/**", "scripts/**"]
  coverageExclude?: string[];
  /** Set true to include test/spec files in the headline aggregation. Default: false. */
  includeTests?: boolean;
}

function gitRoot(from: string): string | null {
  try {
    return execSync("git rev-parse --show-toplevel", {
      cwd: from,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

function tryReadJson(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

export function loadConfig(startDir: string): LumenConfig {
  const root = gitRoot(startDir) ?? startDir;
  let dir = path.resolve(startDir);

  while (true) {
    const explicit = path.join(dir, "lumen.config.json");
    if (fs.existsSync(explicit)) {
      const data = tryReadJson(explicit);
      if (data && typeof data === "object") return data as LumenConfig;
    }

    const rc = path.join(dir, ".lumenrc");
    if (fs.existsSync(rc)) {
      const data = tryReadJson(rc);
      if (data && typeof data === "object") return data as LumenConfig;
    }

    const pkg = path.join(dir, "package.json");
    if (fs.existsSync(pkg)) {
      const data = tryReadJson(pkg) as Record<string, unknown> | null;
      if (data?.lumen && typeof data.lumen === "object") return data.lumen as LumenConfig;
    }

    const parent = path.dirname(dir);
    if (dir === root || dir === parent) break;
    dir = parent;
  }
  return {};
}

/**
 * Writes the config to `lumen.config.json` at the repo's git root (or the
 * supplied directory if not in a git repo). Strips undefined values and
 * empty `thresholds` blocks so the file stays tidy.
 */
export function saveConfig(startDir: string, config: LumenConfig): string {
  const dir = gitRoot(startDir) ?? startDir;
  const file = path.join(dir, "lumen.config.json");

  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length === 0) continue;
    clean[k] = v;
  }

  fs.writeFileSync(file, JSON.stringify(clean, null, 2) + "\n", "utf8");
  return file;
}
