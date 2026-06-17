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

const MAX_DEPTH = 30;
const TOP_LARGEST = 15;

function insertTop(top: FileEntry[], entry: FileEntry, limit: number) {
  if (top.length < limit) {
    top.push(entry);
    if (top.length === limit) top.sort((a, b) => a.size - b.size);
    return;
  }
  if (entry.size <= top[0].size) return;
  top[0] = entry;
  let i = 0;
  while (i + 1 < top.length && top[i].size > top[i + 1].size) {
    const tmp = top[i];
    top[i] = top[i + 1];
    top[i + 1] = tmp;
    i++;
  }
}

export function scanRepo(root: string): RepoStats {
  const absRoot = path.resolve(root);
  const rootName = path.basename(absRoot);
  const dirAgg = new Map<string, { files: number; bytes: number }>();
  const byExtMap = new Map<string, ExtStat>();
  const ignored: string[] = [];
  const largestMinHeap: FileEntry[] = [];
  const notableHits = new Map<string, { relPath: string; size: number }>();
  const notableLower = new Set(NOTABLE_NAMES.map((n) => n.toLowerCase()));
  let totalFiles = 0;
  let totalBytes = 0;
  let totalLines = 0;
  const visited = new Set<string>();

  function walk(dir: string, depth: number) {
    if (depth > MAX_DEPTH) return;
    let real: string;
    try {
      real = fs.realpathSync(dir);
    } catch {
      real = dir;
    }
    if (visited.has(real)) return;
    visited.add(real);

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
          ignored.push(path.relative(absRoot, full).split(path.sep).join("/"));
          continue;
        }
        walk(full, depth + 1);
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

        totalFiles += 1;
        totalBytes += stat.size;
        totalLines += lines;

        const extStat = byExtMap.get(ext) ?? { ext, files: 0, bytes: 0, lines: 0 };
        extStat.files += 1;
        extStat.bytes += stat.size;
        extStat.lines += lines;
        byExtMap.set(ext, extStat);

        const topDir = rel.includes("/") ? rel.split("/")[0] : "(root)";
        const cur = dirAgg.get(topDir) ?? { files: 0, bytes: 0 };
        cur.files += 1;
        cur.bytes += stat.size;
        dirAgg.set(topDir, cur);

        insertTop(largestMinHeap, { relPath: rel, size: stat.size, lines, ext }, TOP_LARGEST);

        const relLower = rel.toLowerCase();
        if (notableLower.has(relLower) && !notableHits.has(relLower)) {
          notableHits.set(relLower, { relPath: rel, size: stat.size });
        }
      }
    }
  }

  walk(absRoot, 0);

  const byExtension = [...byExtMap.values()].sort((a, b) => b.files - a.files);
  const largestFiles = largestMinHeap.slice().sort((a, b) => b.size - a.size);

  const topDirectories = [...dirAgg.entries()]
    .map(([dir, v]) => ({ dir, files: v.files, bytes: v.bytes }))
    .sort((a, b) => b.files - a.files)
    .slice(0, 12);

  const notableFiles: { name: string; relPath: string; size: number }[] = [];
  const seenNotable = new Set<string>();
  for (const name of NOTABLE_NAMES) {
    const key = name.toLowerCase();
    const hit = notableHits.get(key);
    if (hit && !seenNotable.has(key)) {
      seenNotable.add(key);
      notableFiles.push({ name, relPath: hit.relPath, size: hit.size });
    }
  }

  return {
    root: absRoot,
    rootName,
    scannedAt: new Date().toISOString(),
    totalFiles,
    totalBytes,
    totalLines,
    largestFiles,
    byExtension,
    topDirectories,
    notableFiles,
    ignored,
  };
}
