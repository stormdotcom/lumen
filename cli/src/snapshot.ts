import * as fs from "fs";
import * as path from "path";
import type { CoverageReport } from "@ajmal_n/lumen-core";

interface Snapshot {
  timestamp: string;
  metrics: {
    lines: number;
    statements: number;
    functions: number;
    branches: number;
  };
}

export interface MetricDrop {
  metric: string;
  before: number;
  after: number;
}

const SNAPSHOT_FILE = path.join(".lumen", "snapshot.json");

export function loadSnapshot(projectRoot: string): Snapshot | null {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(projectRoot, SNAPSHOT_FILE), "utf8"));
    if (data?.metrics) return data as Snapshot;
    return null;
  } catch {
    return null;
  }
}

export function saveSnapshot(projectRoot: string, total: CoverageReport["total"]): void {
  try {
    const dir = path.join(projectRoot, ".lumen");
    fs.mkdirSync(dir, { recursive: true });
    const snap: Snapshot = {
      timestamp: new Date().toISOString(),
      metrics: {
        lines: total.lines.pct,
        statements: total.statements.pct,
        functions: total.functions.pct,
        branches: total.branches.pct,
      },
    };
    fs.writeFileSync(path.join(projectRoot, SNAPSHOT_FILE), JSON.stringify(snap, null, 2), "utf8");
  } catch {
    // never crash the CLI over snapshot write failure
  }
}

export function compareSnapshot(snapshot: Snapshot, current: CoverageReport["total"]): MetricDrop[] {
  const drops: MetricDrop[] = [];
  const pairs: Array<[keyof Snapshot["metrics"], number]> = [
    ["lines", current.lines.pct],
    ["statements", current.statements.pct],
    ["functions", current.functions.pct],
    ["branches", current.branches.pct],
  ];
  for (const [metric, after] of pairs) {
    const before = snapshot.metrics[metric];
    if (after < before) drops.push({ metric, before, after });
  }
  return drops;
}
