import { detectFramework, findCoverage } from "../src/coverage";
import { makeTmpRepo, rmTmpRepo } from "./helpers";

const summary = {
  total: {
    lines: { total: 100, covered: 80, pct: 80 },
    statements: { total: 100, covered: 80, pct: 80 },
    functions: { total: 20, covered: 15, pct: 75 },
    branches: { total: 40, covered: 28, pct: 70 },
  },
  "src/a.ts": {
    lines: { total: 50, covered: 45, pct: 90 },
    statements: { total: 50, covered: 45, pct: 90 },
    functions: { total: 10, covered: 9, pct: 90 },
    branches: { total: 20, covered: 16, pct: 80 },
  },
  "src/b.ts": {
    lines: { total: 50, covered: 35, pct: 70 },
    statements: { total: 50, covered: 35, pct: 70 },
    functions: { total: 10, covered: 6, pct: 60 },
    branches: { total: 20, covered: 12, pct: 60 },
  },
};

const lcov = `TN:
SF:src/c.ts
FNF:4
FNH:3
LF:30
LH:24
BRF:10
BRH:7
end_of_record
TN:
SF:src/d.ts
FNF:2
FNH:0
LF:10
LH:0
BRF:4
BRH:0
end_of_record
`;

describe("detectFramework", () => {
  test("detects jest from package.json devDependencies", () => {
    const root = makeTmpRepo("fw-jest", {
      "package.json": JSON.stringify({ devDependencies: { jest: "^29" } }),
    });
    try {
      expect(detectFramework(root)).toBe("jest");
    } finally {
      rmTmpRepo(root);
    }
  });

  test("detects vitest before jest when both are present (vitest takes priority)", () => {
    const root = makeTmpRepo("fw-vitest", {
      "package.json": JSON.stringify({
        devDependencies: { vitest: "^1", jest: "^29" },
      }),
    });
    try {
      expect(detectFramework(root)).toBe("vitest");
    } finally {
      rmTmpRepo(root);
    }
  });

  test("detects jasmine", () => {
    const root = makeTmpRepo("fw-jasmine", {
      "package.json": JSON.stringify({ devDependencies: { jasmine: "^5" } }),
    });
    try {
      expect(detectFramework(root)).toBe("jasmine");
    } finally {
      rmTmpRepo(root);
    }
  });

  test("detects mocha via nyc", () => {
    const root = makeTmpRepo("fw-mocha", {
      "package.json": JSON.stringify({ devDependencies: { mocha: "^10", nyc: "^15" } }),
    });
    try {
      expect(detectFramework(root)).toBe("mocha");
    } finally {
      rmTmpRepo(root);
    }
  });

  test("detects nx via nx.json", () => {
    const root = makeTmpRepo("fw-nx", { "nx.json": "{}" });
    try {
      expect(detectFramework(root)).toBe("nx");
    } finally {
      rmTmpRepo(root);
    }
  });

  test("falls back to jest.config.js when no deps declared", () => {
    const root = makeTmpRepo("fw-jest-config", {
      "jest.config.js": "module.exports = {};",
    });
    try {
      expect(detectFramework(root)).toBe("jest");
    } finally {
      rmTmpRepo(root);
    }
  });

  test("returns 'unknown' when nothing matches", () => {
    const root = makeTmpRepo("fw-unknown", { "package.json": "{}" });
    try {
      expect(detectFramework(root)).toBe("unknown");
    } finally {
      rmTmpRepo(root);
    }
  });
});

describe("findCoverage — coverage-summary.json", () => {
  let root: string;

  beforeAll(() => {
    root = makeTmpRepo("cov-summary", {
      "package.json": JSON.stringify({ devDependencies: { jest: "^29" } }),
      "coverage/coverage-summary.json": JSON.stringify(summary),
    });
  });

  afterAll(() => rmTmpRepo(root));

  test("returns a CoverageReport with framework detected", () => {
    const report = findCoverage(root);
    expect(report).not.toBeNull();
    expect(report!.framework).toBe("jest");
    expect(report!.sources.length).toBeGreaterThan(0);
  });

  test("aggregates per-file metrics into totals", () => {
    const report = findCoverage(root)!;
    expect(report.total.lines.total).toBe(100);
    expect(report.total.lines.covered).toBe(80);
    expect(report.total.lines.pct).toBe(80);
    expect(report.total.functions.covered).toBe(15);
    expect(report.total.branches.covered).toBe(28);
  });

  test("includes one record per non-total key", () => {
    const report = findCoverage(root)!;
    expect(report.files).toHaveLength(2);
    const paths = report.files.map((f) => f.path).sort();
    expect(paths).toEqual(["src/a.ts", "src/b.ts"]);
  });

  test("returns files sorted by path", () => {
    const report = findCoverage(root)!;
    const sorted = report.files.slice().sort((a, b) => a.path.localeCompare(b.path));
    expect(report.files).toEqual(sorted);
  });
});

describe("findCoverage — lcov.info", () => {
  let root: string;

  beforeAll(() => {
    root = makeTmpRepo("cov-lcov", {
      "package.json": JSON.stringify({ devDependencies: { vitest: "^1" } }),
      "coverage/lcov.info": lcov,
    });
  });

  afterAll(() => rmTmpRepo(root));

  test("parses lcov.info when no coverage-summary.json is present", () => {
    const report = findCoverage(root);
    expect(report).not.toBeNull();
    expect(report!.framework).toBe("vitest");
    expect(report!.files).toHaveLength(2);
  });

  test("computes percentages from LF/LH and FNF/FNH", () => {
    const report = findCoverage(root)!;
    const c = report.files.find((f) => f.path === "src/c.ts")!;
    expect(c.lines.total).toBe(30);
    expect(c.lines.covered).toBe(24);
    expect(c.lines.pct).toBe(80);
    expect(c.functions.pct).toBe(75);
  });

  test("totals across LCOV files are summed", () => {
    const report = findCoverage(root)!;
    expect(report.total.lines.total).toBe(40);
    expect(report.total.lines.covered).toBe(24);
    expect(report.total.lines.pct).toBe(60);
  });
});

describe("findCoverage — no coverage data", () => {
  test("returns null when neither summary nor lcov is present", () => {
    const root = makeTmpRepo("cov-empty", {
      "package.json": JSON.stringify({ devDependencies: { jest: "^29" } }),
    });
    try {
      expect(findCoverage(root)).toBeNull();
    } finally {
      rmTmpRepo(root);
    }
  });
});

describe("findCoverage — coverageDir option", () => {
  test("looks inside the supplied coverageDir", () => {
    const root = makeTmpRepo("cov-custom", {
      "package.json": JSON.stringify({ devDependencies: { jest: "^29" } }),
      "build-output/coverage-summary.json": JSON.stringify(summary),
    });
    try {
      const report = findCoverage(root, { coverageDir: "build-output" });
      expect(report).not.toBeNull();
      expect(report!.files).toHaveLength(2);
    } finally {
      rmTmpRepo(root);
    }
  });
});
