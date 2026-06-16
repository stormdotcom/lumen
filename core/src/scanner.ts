import * as fs from "fs";
import * as path from "path";

export interface FileEntry {
  relPath: string;
  size: number;
  lines: number;
  ext: string;
}

export interface ExtStat {
  ext: string;
  files: number;
  bytes: number;
  lines: number;
}

export interface RepoStats {
  root: string;
  rootName: string;
  scannedAt: string;
  totalFiles: number;
  totalBytes: number;
  totalLines: number;
  largestFiles: FileEntry[];
  byExtension: ExtStat[];
  topDirectories: { dir: string; files: number; bytes: number }[];
  notableFiles: { name: string; relPath: string; size: number }[];
  ignored: string[];
}

const DEFAULT_IGNORE = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  "release",
  ".next",
  ".nuxt",
  ".cache",
  "coverage",
  ".turbo",
  ".parcel-cache",
  ".venv",
  "venv",
  "__pycache__",
  ".idea",
  ".vscode",
]);

const TEXT_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".json", ".md", ".markdown", ".txt", ".yml", ".yaml",
  ".html", ".css", ".scss", ".less", ".svg",
  ".py", ".rb", ".go", ".rs", ".java", ".kt", ".swift",
  ".c", ".h", ".cc", ".cpp", ".hpp",
  ".sh", ".bash", ".zsh", ".ps1",
  ".toml", ".ini", ".env", ".xml", ".vue", ".svelte",
  ".sql", ".graphql", ".gql",
]);

const NOTABLE_NAMES = [
  "README.md", "README", "readme.md",
  "LICENSE", "LICENSE.md", "LICENSE.txt",
  "package.json", "tsconfig.json",
  "Cargo.toml", "go.mod", "pyproject.toml", "requirements.txt",
  "Dockerfile", "docker-compose.yml",
  ".gitignore", "CHANGELOG.md", "CONTRIBUTING.md",
];

function countLines(filePath: string, size: number): number {
  if (size > 5 * 1024 * 1024) return 0;
  try {
    const buf = fs.readFileSync(filePath);
    let count = 0;
    for (let i = 0; i < buf.length; i++) {
      if (buf[i] === 0x0a) count++;
    }
    if (buf.length > 0 && buf[buf.length - 1] !== 0x0a) count++;
    return count;
  } catch {
    return 0;
  }
}

export function scanRepo(root: string): RepoStats {
  const absRoot = path.resolve(root);
  const rootName = path.basename(absRoot);
  const entries: FileEntry[] = [];
  const dirAgg = new Map<string, { files: number; bytes: number }>();
  const ignored: string[] = [];

  function walk(dir: string) {
    let items: fs.Dirent[];
    try {
      items = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const item of items) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) {
        if (DEFAULT_IGNORE.has(item.name)) {
          ignored.push(path.relative(absRoot, full));
          continue;
        }
        walk(full);
      } else if (item.isFile()) {
        let stat: fs.Stats;
        try {
          stat = fs.statSync(full);
        } catch {
          continue;
        }
        const rel = path.relative(absRoot, full).split(path.sep).join("/");
        const ext = path.extname(item.name).toLowerCase() || "(no ext)";
        const lines = TEXT_EXTENSIONS.has(ext) ? countLines(full, stat.size) : 0;
        entries.push({ relPath: rel, size: stat.size, lines, ext });

        const topDir = rel.includes("/") ? rel.split("/")[0] : "(root)";
        const cur = dirAgg.get(topDir) ?? { files: 0, bytes: 0 };
        cur.files += 1;
        cur.bytes += stat.size;
        dirAgg.set(topDir, cur);
      }
    }
  }

  walk(absRoot);

  const byExtMap = new Map<string, ExtStat>();
  let totalBytes = 0;
  let totalLines = 0;
  for (const e of entries) {
    totalBytes += e.size;
    totalLines += e.lines;
    const cur = byExtMap.get(e.ext) ?? { ext: e.ext, files: 0, bytes: 0, lines: 0 };
    cur.files += 1;
    cur.bytes += e.size;
    cur.lines += e.lines;
    byExtMap.set(e.ext, cur);
  }

  const byExtension = [...byExtMap.values()].sort((a, b) => b.files - a.files);
  const largestFiles = [...entries].sort((a, b) => b.size - a.size).slice(0, 15);

  const topDirectories = [...dirAgg.entries()]
    .map(([dir, v]) => ({ dir, files: v.files, bytes: v.bytes }))
    .sort((a, b) => b.files - a.files)
    .slice(0, 12);

  const notableFiles: { name: string; relPath: string; size: number }[] = [];
  for (const name of NOTABLE_NAMES) {
    const found = entries.find((e) => e.relPath.toLowerCase() === name.toLowerCase());
    if (found) {
      notableFiles.push({ name, relPath: found.relPath, size: found.size });
    }
  }

  return {
    root: absRoot,
    rootName,
    scannedAt: new Date().toISOString(),
    totalFiles: entries.length,
    totalBytes,
    totalLines,
    largestFiles,
    byExtension,
    topDirectories,
    notableFiles,
    ignored,
  };
}
