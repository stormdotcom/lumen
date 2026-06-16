interface FileEntry {
  relPath: string;
  size: number;
  lines: number;
  ext: string;
}
interface ExtStat { ext: string; files: number; bytes: number; lines: number; }
interface RepoStats {
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

interface LumenApi {
  pickDirectory: () => Promise<string | null>;
  scanRepo: (dir: string) => Promise<RepoStats>;
  exportReport: (stats: RepoStats) => Promise<string | null>;
  reveal: (filePath: string) => Promise<void>;
}

declare global {
  interface Window { lumen: LumenApi; }
}

export {};

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

const btnOpen = $("#btn-open") as HTMLButtonElement;
const btnOpenEmpty = $("#btn-open-empty") as HTMLButtonElement;
const btnExport = $("#btn-export") as HTMLButtonElement;
const emptyEl = $("#empty") as HTMLElement;
const reportEl = $("#report") as HTMLElement;
const toastEl = $("#toast") as HTMLElement;

let currentStats: RepoStats | null = null;

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
function bar(value: number, max: number, tone: "neutral" | "warn" = "neutral"): string {
  const pct = max === 0 ? 0 : Math.round((value / max) * 100);
  return `<div class="bar bar-${tone}"><div class="bar-fill" style="width:${pct}%"></div></div>`;
}
function extTone(ext: string): string {
  const t: Record<string, string> = {
    ".ts": "tone-blue", ".tsx": "tone-blue",
    ".js": "tone-amber", ".jsx": "tone-amber",
    ".md": "tone-violet", ".html": "tone-rose", ".css": "tone-teal",
  };
  return t[ext] || "";
}

function toast(msg: string, ms = 2400) {
  toastEl.textContent = msg;
  toastEl.classList.remove("hidden");
  setTimeout(() => toastEl.classList.add("hidden"), ms);
}

function showScanning(dir: string) {
  emptyEl.classList.add("hidden");
  reportEl.classList.remove("hidden");
  reportEl.innerHTML = `
    <div class="scanning">
      <div class="spinner"></div>
      <div>Scanning <b>${esc(dir)}</b>…</div>
    </div>`;
}

function buildTree(stats: RepoStats): string {
  const root: Record<string, any> = {};
  for (const f of stats.largestFiles) {
    const parts = f.relPath.split("/");
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLeaf = i === parts.length - 1;
      if (isLeaf) {
        node[part] = { __file: f };
      } else {
        node[part] = node[part] || {};
        node = node[part];
      }
    }
  }
  return renderTree(root, 0);
}

function renderTree(node: Record<string, any>, depth: number): string {
  const entries = Object.entries(node).sort(([a, av], [b, bv]) => {
    const af = !!(av as any).__file;
    const bf = !!(bv as any).__file;
    if (af !== bf) return af ? 1 : -1;
    return a.localeCompare(b);
  });
  let html = "";
  for (const [name, child] of entries) {
    const file = (child as any).__file;
    if (file) {
      html += `<li class="tree-file"><span class="tree-name">${esc(name)}</span><span class="tree-meta">${formatBytes(file.size)}</span></li>`;
    } else {
      html += `<li class="tree-dir"><details${depth < 1 ? " open" : ""}><summary><span class="tree-name">${esc(name)}</span></summary><ul>${renderTree(child as any, depth + 1)}</ul></details></li>`;
    }
  }
  return html;
}

function renderReport(stats: RepoStats) {
  currentStats = stats;
  btnExport.disabled = false;

  const maxExtFiles = Math.max(1, ...stats.byExtension.map((e) => e.files));
  const maxDirFiles = Math.max(1, ...stats.topDirectories.map((d) => d.files));
  const maxFileSize = Math.max(1, ...stats.largestFiles.map((f) => f.size));
  const avgSize = stats.totalFiles ? Math.round(stats.totalBytes / stats.totalFiles) : 0;
  const avgLines = stats.totalFiles ? Math.round(stats.totalLines / stats.totalFiles) : 0;

  const extRows = stats.byExtension.slice(0, 20).map((e) => `
    <tr>
      <td><span class="ext-chip ${extTone(e.ext)}">${esc(e.ext)}</span></td>
      <td class="num">${e.files}</td>
      <td>${bar(e.files, maxExtFiles)}</td>
      <td class="num">${formatBytes(e.bytes)}</td>
      <td class="num">${e.lines.toLocaleString()}</td>
    </tr>`).join("");

  const dirRows = stats.topDirectories.map((d) => `
    <tr>
      <td class="mono">${esc(d.dir)}</td>
      <td class="num">${d.files}</td>
      <td>${bar(d.files, maxDirFiles)}</td>
      <td class="num">${formatBytes(d.bytes)}</td>
    </tr>`).join("");

  const largeRows = stats.largestFiles.map((f) => `
    <tr>
      <td class="mono path">${esc(f.relPath)}</td>
      <td class="num">${formatBytes(f.size)}</td>
      <td>${bar(f.size, maxFileSize, "warn")}</td>
    </tr>`).join("");

  const notable = stats.notableFiles.length
    ? stats.notableFiles.map((n) => `
      <li><span class="chip">${esc(n.name)}</span><span class="mono dim">${esc(n.relPath)}</span><span class="dim">${formatBytes(n.size)}</span></li>`).join("")
    : `<li class="dim" style="padding:14px 18px;">No standard project files detected.</li>`;

  reportEl.innerHTML = `
    <header class="report-head">
      <div>
        <h1>${esc(stats.rootName)}</h1>
        <div class="sub">Repository: <b>${esc(stats.rootName)}</b> · <span class="mono">${esc(stats.root)}</span></div>
        <div class="sub">Scanned ${esc(stats.scannedAt)}</div>
      </div>
      <div class="meta">
        <span class="pill">📁 ${stats.totalFiles.toLocaleString()} files</span>
        <span class="pill good">${formatBytes(stats.totalBytes)}</span>
      </div>
    </header>

    <div class="tabs">
      <button class="tab active">Overview</button>
      <button class="tab">File Types</button>
      <button class="tab">Directories</button>
    </div>

    <div class="grid-stats">
      <div class="stat"><div class="row">Total Files</div><div class="value blue">${stats.totalFiles.toLocaleString()}</div><div class="foot">${stats.byExtension.length} distinct extensions</div></div>
      <div class="stat"><div class="row">Total Size</div><div class="value">${formatBytes(stats.totalBytes)}</div><div class="foot">avg ${formatBytes(avgSize)} per file</div></div>
      <div class="stat"><div class="row">Lines of Code</div><div class="value green">${stats.totalLines.toLocaleString()}</div><div class="foot">avg ${avgLines.toLocaleString()} per file</div></div>
      <div class="stat"><div class="row">Ignored Paths</div><div class="value red">${stats.ignored.length}</div><div class="foot">node_modules, .git, build dirs…</div></div>
    </div>

    <div class="layout">
      <aside class="panel">
        <div class="panel-head"><span>File Tree</span><span class="dim">${stats.largestFiles.length} shown</span></div>
        <div class="panel-body"><ul class="tree">${buildTree(stats)}</ul></div>
      </aside>

      <div class="sections">
        <section class="panel">
          <div class="panel-head"><span>Notable Files</span></div>
          <div class="panel-body tight"><ul class="notable">${notable}</ul></div>
        </section>

        <section class="panel">
          <div class="panel-head"><span>File Types</span><span class="dim">${stats.byExtension.length} total</span></div>
          <div class="panel-body tight">
            <table>
              <thead><tr><th>Extension</th><th class="num">Files</th><th></th><th class="num">Size</th><th class="num">Lines</th></tr></thead>
              <tbody>${extRows}</tbody>
            </table>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head"><span>Top Directories</span></div>
          <div class="panel-body tight">
            <table>
              <thead><tr><th>Directory</th><th class="num">Files</th><th></th><th class="num">Size</th></tr></thead>
              <tbody>${dirRows}</tbody>
            </table>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head"><span>Largest Files</span></div>
          <div class="panel-body tight">
            <table>
              <thead><tr><th>Path</th><th class="num">Size</th><th></th></tr></thead>
              <tbody>${largeRows}</tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  `;
}

async function openRepository() {
  const dir = await window.lumen.pickDirectory();
  if (!dir) return;
  showScanning(dir);
  try {
    const stats = await window.lumen.scanRepo(dir);
    renderReport(stats);
  } catch (err) {
    toast(`Scan failed: ${(err as Error).message}`);
    emptyEl.classList.remove("hidden");
    reportEl.classList.add("hidden");
  }
}

async function exportReport() {
  if (!currentStats) return;
  const filePath = await window.lumen.exportReport(currentStats);
  if (filePath) {
    toast(`Saved to ${filePath}`);
    window.lumen.reveal(filePath);
  }
}

btnOpen.addEventListener("click", openRepository);
btnOpenEmpty.addEventListener("click", openRepository);
btnExport.addEventListener("click", exportReport);
