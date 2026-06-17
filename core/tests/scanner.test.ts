import * as path from "path";
import { scanRepo } from "../src/scanner";
import { makeTmpRepo, rmTmpRepo } from "./helpers";

describe("scanRepo", () => {
  let root: string;

  beforeAll(() => {
    root = makeTmpRepo("scanner", {
      "README.md": "# Demo\nA test fixture.\n",
      "package.json": JSON.stringify({
        name: "demo",
        version: "1.0.0",
        scripts: { test: "jest" },
      }),
      "tsconfig.json": "{}\n",
      "src/index.ts": "export const a = 1;\nexport const b = 2;\nexport const c = 3;\n",
      "src/util/format.ts": "export function f(x: number) {\n  return x;\n}\n",
      "src/util/parse.ts": "export const parsed = true;\n",
      "tests/index.test.ts": "test('ok', () => expect(1).toBe(1));\n",
      "node_modules/should-be-ignored.js": "// junk".repeat(100),
      ".git/HEAD": "ref: refs/heads/main",
      "dist/built.js": "compiled",
    });
  });

  afterAll(() => rmTmpRepo(root));

  test("returns repo metadata with absolute root and basename", () => {
    const s = scanRepo(root);
    expect(s.root).toBe(path.resolve(root));
    expect(s.rootName).toBe(path.basename(root));
    expect(new Date(s.scannedAt).toString()).not.toBe("Invalid Date");
  });

  test("counts only non-ignored files", () => {
    const s = scanRepo(root);
    expect(s.totalFiles).toBe(7);
    expect(s.totalLines).toBeGreaterThan(0);
    expect(s.totalBytes).toBeGreaterThan(0);
  });

  test("records ignored directories", () => {
    const s = scanRepo(root);
    expect(s.ignored).toEqual(expect.arrayContaining(["node_modules", ".git", "dist"]));
  });

  test("groups files by extension sorted by file count", () => {
    const s = scanRepo(root);
    const exts = s.byExtension.map((e) => e.ext);
    expect(exts).toEqual(expect.arrayContaining([".ts", ".md", ".json"]));
    const ts = s.byExtension.find((e) => e.ext === ".ts");
    expect(ts?.files).toBe(4);
    expect(ts?.lines).toBeGreaterThan(0);
    for (let i = 1; i < s.byExtension.length; i++) {
      expect(s.byExtension[i].files).toBeLessThanOrEqual(s.byExtension[i - 1].files);
    }
  });

  test("surfaces notable files like README.md and package.json", () => {
    const s = scanRepo(root);
    const names = s.notableFiles.map((n) => n.name);
    expect(names).toEqual(expect.arrayContaining(["README.md", "package.json", "tsconfig.json"]));
  });

  test("ranks top directories by file count", () => {
    const s = scanRepo(root);
    const dirs = s.topDirectories.map((d) => d.dir);
    expect(dirs).toEqual(expect.arrayContaining(["src", "tests", "(root)"]));
    for (let i = 1; i < s.topDirectories.length; i++) {
      expect(s.topDirectories[i].files).toBeLessThanOrEqual(s.topDirectories[i - 1].files);
    }
  });

  test("uses forward slashes in relative paths on all platforms", () => {
    const s = scanRepo(root);
    for (const f of s.largestFiles) {
      expect(f.relPath).not.toMatch(/\\/);
    }
  });

  test("returns empty stats for an empty directory", () => {
    const empty = makeTmpRepo("scanner-empty", {});
    try {
      const s = scanRepo(empty);
      expect(s.totalFiles).toBe(0);
      expect(s.totalBytes).toBe(0);
      expect(s.byExtension).toEqual([]);
    } finally {
      rmTmpRepo(empty);
    }
  });
});
