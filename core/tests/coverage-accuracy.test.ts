import { findCoverage } from "../src/coverage";
import { makeTmpRepo, rmTmpRepo } from "./helpers";

describe("findCoverage — 2-decimal precision", () => {
  test("aggregate pct is rounded to 2 decimals (1/3 → 33.33)", () => {
    const root = makeTmpRepo("cov-prec-third", {
      "package.json": JSON.stringify({ devDependencies: { jest: "^29" } }),
      "coverage/coverage-summary.json": JSON.stringify({
        "src/x.ts": {
          lines: { total: 3, covered: 1, pct: 33.33 },
          statements: { total: 3, covered: 1, pct: 33.33 },
          functions: { total: 3, covered: 1, pct: 33.33 },
          branches: { total: 3, covered: 1, pct: 33.33 },
        },
      }),
    });
    try {
      const r = findCoverage(root)!;
      expect(r.total.lines.pct).toBe(33.33);
      expect(r.files[0].lines.pct).toBe(33.33);
    } finally {
      rmTmpRepo(root);
    }
  });

  test("aggregate pct keeps trailing precision (1/8 → 12.5)", () => {
    const root = makeTmpRepo("cov-prec-eighth", {
      "package.json": JSON.stringify({ devDependencies: { jest: "^29" } }),
      "coverage/coverage-summary.json": JSON.stringify({
        "src/y.ts": {
          lines: { total: 8, covered: 1, pct: 12.5 },
          statements: { total: 8, covered: 1, pct: 12.5 },
          functions: { total: 8, covered: 1, pct: 12.5 },
          branches: { total: 8, covered: 1, pct: 12.5 },
        },
      }),
    });
    try {
      const r = findCoverage(root)!;
      expect(r.total.lines.pct).toBe(12.5);
    } finally {
      rmTmpRepo(root);
    }
  });
});

describe("findCoverage — N/A handling for zero-denominator metrics", () => {
  test("a file with 0/0 branches does not push aggregate branch% to 100", () => {
    // file A: 5/10 branches (50%)
    // file B: 0/0 branches (N/A — excluded)
    // expected aggregate branches: 50.00 (not 75.00)
    const root = makeTmpRepo("cov-na-branches", {
      "package.json": JSON.stringify({ devDependencies: { jest: "^29" } }),
      "coverage/coverage-summary.json": JSON.stringify({
        "src/a.ts": {
          lines: { total: 10, covered: 5, pct: 50 },
          statements: { total: 10, covered: 5, pct: 50 },
          functions: { total: 4, covered: 2, pct: 50 },
          branches: { total: 10, covered: 5, pct: 50 },
        },
        "src/b.ts": {
          lines: { total: 10, covered: 5, pct: 50 },
          statements: { total: 10, covered: 5, pct: 50 },
          functions: { total: 0, covered: 0, pct: 100 },
          branches: { total: 0, covered: 0, pct: 100 },
        },
      }),
    });
    try {
      const r = findCoverage(root)!;
      expect(r.total.branches.total).toBe(10);
      expect(r.total.branches.covered).toBe(5);
      expect(r.total.branches.pct).toBe(50);
      expect(r.total.functions.total).toBe(4);
      expect(r.total.functions.pct).toBe(50);
    } finally {
      rmTmpRepo(root);
    }
  });

  test("a file's own zero-denominator metric reports pct=0 (not 100)", () => {
    const root = makeTmpRepo("cov-na-file", {
      "package.json": JSON.stringify({ devDependencies: { jest: "^29" } }),
      "coverage/coverage-summary.json": JSON.stringify({
        "src/c.ts": {
          lines: { total: 5, covered: 5, pct: 100 },
          statements: { total: 5, covered: 5, pct: 100 },
          functions: { total: 0, covered: 0, pct: 100 },
          branches: { total: 0, covered: 0, pct: 100 },
        },
      }),
    });
    try {
      const r = findCoverage(root)!;
      const f = r.files[0];
      expect(f.branches.pct).toBe(0);
      expect(f.functions.pct).toBe(0);
      expect(f.lines.pct).toBe(100);
    } finally {
      rmTmpRepo(root);
    }
  });

  test("extractMetric ignores raw.pct and recomputes from covered/total", () => {
    // raw says pct: 99 but covered/total say 50% — we trust covered/total
    const root = makeTmpRepo("cov-recompute", {
      "package.json": JSON.stringify({ devDependencies: { jest: "^29" } }),
      "coverage/coverage-summary.json": JSON.stringify({
        "src/r.ts": {
          lines: { total: 10, covered: 5, pct: 99 },
          statements: { total: 10, covered: 5, pct: 99 },
          functions: { total: 10, covered: 5, pct: 99 },
          branches: { total: 10, covered: 5, pct: 99 },
        },
      }),
    });
    try {
      const r = findCoverage(root)!;
      expect(r.files[0].lines.pct).toBe(50);
    } finally {
      rmTmpRepo(root);
    }
  });
});

describe("findCoverage — untested source files", () => {
  test("flags source files that have no coverage entry, skips test files", () => {
    const root = makeTmpRepo("cov-untested", {
      "package.json": JSON.stringify({ devDependencies: { jest: "^29" } }),
      "coverage/coverage-summary.json": JSON.stringify({
        "src/a.ts": {
          lines: { total: 10, covered: 10, pct: 100 },
          statements: { total: 10, covered: 10, pct: 100 },
          functions: { total: 2, covered: 2, pct: 100 },
          branches: { total: 4, covered: 4, pct: 100 },
        },
      }),
      "src/a.ts": "// covered file\nexport const a = 1;\n",
      "src/a.test.ts": "// test file — should be excluded\n",
      "src/b.ts": "// untested\nexport const b = 1;\nexport const c = 2;\n",
      "src/c.js": "// also untested\nmodule.exports = {};\n",
    });
    try {
      const r = findCoverage(root)!;
      expect(r.untested).toBeDefined();
      const paths = r.untested!.files.map((f) => f.path).sort();
      expect(paths).toEqual(["src/b.ts", "src/c.js"]);
      expect(r.untested!.count).toBe(2);
      expect(r.untested!.totalLines).toBeGreaterThan(0);
    } finally {
      rmTmpRepo(root);
    }
  });

  test("untested files do NOT affect headline totals (sidecar only)", () => {
    const root = makeTmpRepo("cov-untested-isolated", {
      "package.json": JSON.stringify({ devDependencies: { jest: "^29" } }),
      "coverage/coverage-summary.json": JSON.stringify({
        "src/a.ts": {
          lines: { total: 10, covered: 10, pct: 100 },
          statements: { total: 10, covered: 10, pct: 100 },
          functions: { total: 2, covered: 2, pct: 100 },
          branches: { total: 4, covered: 4, pct: 100 },
        },
      }),
      "src/a.ts": "// covered\n",
      "src/untested.ts": "// has no coverage\nexport const x = 1;\n",
    });
    try {
      const r = findCoverage(root)!;
      expect(r.total.lines.pct).toBe(100);
      expect(r.untested!.count).toBe(1);
    } finally {
      rmTmpRepo(root);
    }
  });
});
