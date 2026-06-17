import { renderReport } from "../src/report";
import { RepoStats } from "../src/scanner";
import { CoverageReport } from "../src/coverage";

const stats: RepoStats = {
  root: "/tmp/demo",
  rootName: "demo",
  scannedAt: "2026-01-01T00:00:00.000Z",
  totalFiles: 5,
  totalBytes: 2048,
  totalLines: 400,
  largestFiles: [
    { relPath: "src/big.ts", size: 1500, lines: 200, ext: ".ts" },
    { relPath: "src/index.ts", size: 400, lines: 100, ext: ".ts" },
    { relPath: "README.md", size: 100, lines: 30, ext: ".md" },
    { relPath: "package.json", size: 48, lines: 10, ext: ".json" },
  ],
  byExtension: [
    { ext: ".ts", files: 3, bytes: 1900, lines: 360 },
    { ext: ".json", files: 1, bytes: 48, lines: 10 },
    { ext: ".md", files: 1, bytes: 100, lines: 30 },
  ],
  topDirectories: [
    { dir: "src", files: 3, bytes: 1900 },
    { dir: "(root)", files: 2, bytes: 148 },
  ],
  notableFiles: [
    { name: "README.md", relPath: "README.md", size: 100 },
    { name: "package.json", relPath: "package.json", size: 48 },
  ],
  ignored: ["node_modules", ".git"],
};

const coverage: CoverageReport = {
  root: "/tmp/demo",
  framework: "vitest",
  sources: ["coverage/coverage-summary.json"],
  total: {
    lines: { total: 400, covered: 240, pct: 60 },
    statements: { total: 400, covered: 240, pct: 60 },
    functions: { total: 50, covered: 35, pct: 70 },
    branches: { total: 100, covered: 55, pct: 55 },
  },
  files: [
    {
      path: "src/big.ts",
      lines: { total: 200, covered: 80, pct: 40 },
      statements: { total: 200, covered: 80, pct: 40 },
      functions: { total: 20, covered: 12, pct: 60 },
      branches: { total: 60, covered: 30, pct: 50 },
    },
  ],
};

describe("renderReport (HTML)", () => {
  test("returns a self-contained HTML document", () => {
    const html = renderReport(stats);
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("</html>");
    expect(html).toContain("<style>");
  });

  test("escapes user-supplied strings", () => {
    const evil: RepoStats = {
      ...stats,
      rootName: "<script>alert(1)</script>",
      notableFiles: [{ name: "<bad>", relPath: "<bad>", size: 1 }],
    };
    const html = renderReport(evil);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  test("includes summary numbers", () => {
    const html = renderReport(stats);
    expect(html).toContain("5");
    expect(html).toContain("400");
  });

  test("omits coverage panel when coverage is absent", () => {
    const html = renderReport(stats);
    expect(html).not.toMatch(/Test Coverage/);
    expect(html).not.toMatch(/Per-file Coverage/);
  });

  test("includes coverage panel when coverage is supplied", () => {
    const html = renderReport(stats, { coverage });
    expect(html).toContain("Test Coverage");
    expect(html).toContain("vitest");
    expect(html).toContain("60.0%");
  });

  test("renders threshold pill (passed) when threshold is met", () => {
    const html = renderReport(stats, { coverage, threshold: 50 });
    expect(html).toMatch(/threshold 50% — passed/);
  });

  test("renders threshold pill (failed) when threshold is not met", () => {
    const html = renderReport(stats, { coverage, threshold: 90 });
    expect(html).toMatch(/threshold 90% — failed/);
  });

  test("includes AI Analysis panel when aiSummary is provided", () => {
    const html = renderReport(stats, {
      aiSummary: { model: "gpt-4o-mini", text: "Looks fine." },
    });
    expect(html).toContain("AI Analysis");
    expect(html).toContain("gpt-4o-mini");
    expect(html).toContain("Looks fine.");
  });

  test("escapes HTML inside AI text", () => {
    const html = renderReport(stats, {
      aiSummary: { model: "x", text: "<script>bad()</script>" },
    });
    expect(html).not.toContain("<script>bad()</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
