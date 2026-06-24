import * as fs from "fs";
import * as path from "path";

export type CoverageFramework =
  | "jest"
  | "vitest"
  | "jasmine"
  | "mocha"
  | "karma"
  | "nx"
  | "ava"
  | "tap"
  | "unknown";

export interface CoverageMetric {
  total: number;
  covered: number;
  pct: number;
}

export interface FileCoverage {
  path: string;
  lines: CoverageMetric;
  statements: CoverageMetric;
  functions: CoverageMetric;
  branches: CoverageMetric;
  uncoveredLines?: number[];
}

export interface CoverageReport {
  root: string;
  framework: CoverageFramework;
  sources: string[];
  total: {
    lines: CoverageMetric;
    statements: CoverageMetric;
    functions: CoverageMetric;
    branches: CoverageMetric;
  };
  files: FileCoverage[];
}

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", ".nuxt", ".cache",
  ".turbo", ".parcel-cache", ".venv", "venv", "__pycache__",
  ".idea", ".vscode", "release", "out",
]);

function emptyMetric(): CoverageMetric {
  return { total: 0, covered: 0, pct: 0 };
}

function emptyTotals() {
  return {
    lines: emptyMetric(),
    statements: emptyMetric(),
    functions: emptyMetric(),
    branches: emptyMetric(),
  };
}

function pct(covered: number, total: number): number {
  if (total === 0) return 100;
  return Math.round((covered / total) * 1000) / 10;
}

function readJson(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function findCoverageSummaries(root: string): string[] {
  const found: string[] = [];
  const visit = (dir: string, depth: number) => {
    if (depth > 6) return;
    let items: fs.Dirent[];
    try {
      items = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const item of items) {
      if (!item.isDirectory()) continue;
      if (SKIP_DIRS.has(item.name)) continue;
      const full = path.join(dir, item.name);
      if (item.name === "coverage" || item.name.startsWith("coverage-")) {
        const direct = path.join(full, "coverage-summary.json");
        if (fs.existsSync(direct)) found.push(direct);
        try {
          for (const sub of fs.readdirSync(full, { withFileTypes: true })) {
            if (sub.isDirectory()) {
              const nested = path.join(full, sub.name, "coverage-summary.json");
              if (fs.existsSync(nested)) found.push(nested);
            }
          }
        } catch {
          // ignore
        }
      } else {
        visit(full, depth + 1);
      }
    }
  };
  visit(root, 0);
  return found;
}

function findLcovFiles(root: string): string[] {
  const found: string[] = [];
  const visit = (dir: string, depth: number) => {
    if (depth > 6) return;
    let items: fs.Dirent[];
    try {
      items = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const item of items) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) {
        if (SKIP_DIRS.has(item.name)) continue;
        visit(full, depth + 1);
      } else if (item.name === "lcov.info") {
        found.push(full);
      }
    }
  };
  visit(root, 0);
  return found;
}

function normalizeRelPath(absRoot: string, p: string): string {
  if (path.isAbsolute(p)) {
    const rel = path.relative(absRoot, p);
    return rel.split(path.sep).join("/");
  }
  return p.split(path.sep).join("/");
}

function parseSummary(file: string, absRoot: string): FileCoverage[] {
  const data = readJson(file);
  if (!data || typeof data !== "object") return [];
  const out: FileCoverage[] = [];
  for (const [key, val] of Object.entries(data as Record<string, any>)) {
    if (key === "total") continue;
    if (!val || typeof val !== "object") continue;
    const rel = normalizeRelPath(absRoot, key);
    if (rel.startsWith("..")) continue;
    out.push({
      path: rel,
      lines: extractMetric(val.lines),
      statements: extractMetric(val.statements),
      functions: extractMetric(val.functions),
      branches: extractMetric(val.branches),
    });
  }
  return out;
}

function extractMetric(raw: any): CoverageMetric {
  if (!raw || typeof raw !== "object") return emptyMetric();
  const total = Number(raw.total) || 0;
  const covered = Number(raw.covered) || 0;
  const explicitPct = raw.pct;
  return {
    total,
    covered,
    pct: typeof explicitPct === "number" ? explicitPct : pct(covered, total),
  };
}

function parseLcov(file: string, absRoot: string): FileCoverage[] {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return [];
  }
  const records = text.split(/end_of_record/);
  const out: FileCoverage[] = [];
  for (const rec of records) {
    const line = rec.trim();
    if (!line) continue;
    const get = (prefix: string): number => {
      const m = line.match(new RegExp(`^${prefix}:(\\d+)`, "m"));
      return m ? parseInt(m[1], 10) : 0;
    };
    const src = (line.match(/^SF:(.+)$/m) || [])[1];
    if (!src) continue;
    const lf = get("LF");
    const lh = get("LH");
    const brf = get("BRF");
    const brh = get("BRH");
    const fnf = get("FNF");
    const fnh = get("FNH");
    const daMatches = [...rec.matchAll(/^DA:(\d+),(\d+)/gm)];
    const uncoveredLines = daMatches
      .filter((m) => parseInt(m[2], 10) === 0)
      .map((m) => parseInt(m[1], 10))
      .sort((a, b) => a - b);
    out.push({
      path: normalizeRelPath(absRoot, src.trim()),
      lines: { total: lf, covered: lh, pct: pct(lh, lf) },
      statements: { total: lf, covered: lh, pct: pct(lh, lf) },
      functions: { total: fnf, covered: fnh, pct: pct(fnh, fnf) },
      branches: { total: brf, covered: brh, pct: pct(brh, brf) },
      ...(uncoveredLines.length ? { uncoveredLines } : {}),
    });
  }
  return out;
}

function mergeFiles(groups: FileCoverage[][]): FileCoverage[] {
  const map = new Map<string, FileCoverage>();
  for (const group of groups) {
    for (const f of group) {
      const cur = map.get(f.path);
      if (!cur) {
        map.set(f.path, { ...f });
      } else {
        cur.lines = mergeMetric(cur.lines, f.lines);
        cur.statements = mergeMetric(cur.statements, f.statements);
        cur.functions = mergeMetric(cur.functions, f.functions);
        cur.branches = mergeMetric(cur.branches, f.branches);
        if (f.uncoveredLines) {
          const merged = new Set([...(cur.uncoveredLines ?? []), ...f.uncoveredLines]);
          cur.uncoveredLines = [...merged].sort((a, b) => a - b);
        }
      }
    }
  }
  return [...map.values()];
}

function mergeMetric(a: CoverageMetric, b: CoverageMetric): CoverageMetric {
  const total = a.total + b.total;
  const covered = a.covered + b.covered;
  return { total, covered, pct: pct(covered, total) };
}

function totalsFromFiles(files: FileCoverage[]) {
  const t = emptyTotals();
  for (const f of files) {
    t.lines.total += f.lines.total;
    t.lines.covered += f.lines.covered;
    t.statements.total += f.statements.total;
    t.statements.covered += f.statements.covered;
    t.functions.total += f.functions.total;
    t.functions.covered += f.functions.covered;
    t.branches.total += f.branches.total;
    t.branches.covered += f.branches.covered;
  }
  t.lines.pct = pct(t.lines.covered, t.lines.total);
  t.statements.pct = pct(t.statements.covered, t.statements.total);
  t.functions.pct = pct(t.functions.covered, t.functions.total);
  t.branches.pct = pct(t.branches.covered, t.branches.total);
  return t;
}

export function detectFramework(absRoot: string): CoverageFramework {
  if (fs.existsSync(path.join(absRoot, "nx.json"))) return "nx";
  const pkgPath = path.join(absRoot, "package.json");
  if (fs.existsSync(pkgPath)) {
    const pkg = readJson(pkgPath) as any;
    const all = {
      ...(pkg?.dependencies || {}),
      ...(pkg?.devDependencies || {}),
    };
    if ("@nx/jest" in all || "nx" in all || "@nrwl/nx" in all) return "nx";
    if ("vitest" in all) return "vitest";
    if ("jest" in all || "ts-jest" in all || "@types/jest" in all) return "jest";
    if ("jasmine" in all || "jasmine-core" in all) return "jasmine";
    if ("karma" in all) return "karma";
    if ("mocha" in all || "nyc" in all) return "mocha";
    if ("ava" in all) return "ava";
    if ("tap" in all || "node-tap" in all) return "tap";
  }
  if (
    fs.existsSync(path.join(absRoot, "jest.config.js")) ||
    fs.existsSync(path.join(absRoot, "jest.config.ts")) ||
    fs.existsSync(path.join(absRoot, "jest.config.json"))
  ) return "jest";
  if (
    fs.existsSync(path.join(absRoot, "vitest.config.js")) ||
    fs.existsSync(path.join(absRoot, "vitest.config.ts"))
  ) return "vitest";
  if (
    fs.existsSync(path.join(absRoot, "karma.conf.js")) ||
    fs.existsSync(path.join(absRoot, "karma.conf.ts"))
  ) return "karma";
  if (fs.existsSync(path.join(absRoot, ".mocharc.json")) || fs.existsSync(path.join(absRoot, "mocha.opts"))) return "mocha";
  return "unknown";
}

export interface FindCoverageOptions {
  coverageDir?: string;
}

export function findCoverage(root: string, options: FindCoverageOptions = {}): CoverageReport | null {
  const absRoot = path.resolve(root);
  const framework = detectFramework(absRoot);

  const summaryFiles: string[] = [];
  const lcovFiles: string[] = [];

  if (options.coverageDir) {
    const dir = path.resolve(absRoot, options.coverageDir);
    const summary = path.join(dir, "coverage-summary.json");
    const lcov = path.join(dir, "lcov.info");
    if (fs.existsSync(summary)) summaryFiles.push(summary);
    if (fs.existsSync(lcov)) lcovFiles.push(lcov);
    if (summaryFiles.length === 0 && lcovFiles.length === 0) {
      try {
        for (const sub of fs.readdirSync(dir, { withFileTypes: true })) {
          if (sub.isDirectory()) {
            const s = path.join(dir, sub.name, "coverage-summary.json");
            const l = path.join(dir, sub.name, "lcov.info");
            if (fs.existsSync(s)) summaryFiles.push(s);
            if (fs.existsSync(l)) lcovFiles.push(l);
          }
        }
      } catch {
        // ignore
      }
    }
  } else {
    summaryFiles.push(...findCoverageSummaries(absRoot));
    if (summaryFiles.length === 0) {
      lcovFiles.push(...findLcovFiles(absRoot));
    }
  }

  if (summaryFiles.length === 0 && lcovFiles.length === 0) return null;

  const groups: FileCoverage[][] = [];
  for (const file of summaryFiles) groups.push(parseSummary(file, absRoot));
  for (const file of lcovFiles) groups.push(parseLcov(file, absRoot));

  const files = mergeFiles(groups).sort((a, b) => a.path.localeCompare(b.path));
  const sources = [...summaryFiles, ...lcovFiles].map((f) => normalizeRelPath(absRoot, f));

  return {
    root: absRoot,
    framework,
    sources,
    total: totalsFromFiles(files),
    files,
  };
}
