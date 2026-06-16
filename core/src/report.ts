import { RepoStats } from "./scanner";

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

function bar(value: number, max: number, tone: "neutral" | "good" | "warn" = "neutral"): string {
  const pct = max === 0 ? 0 : Math.round((value / max) * 100);
  return `<div class="bar bar-${tone}"><div class="bar-fill" style="width:${pct}%"></div></div>`;
}

function badgeForExt(ext: string): string {
  const tones: Record<string, string> = {
    ".ts": "tone-blue",
    ".tsx": "tone-blue",
    ".js": "tone-amber",
    ".jsx": "tone-amber",
    ".json": "tone-slate",
    ".md": "tone-violet",
    ".html": "tone-rose",
    ".css": "tone-teal",
  };
  return tones[ext] || "tone-slate";
}

function buildTree(stats: RepoStats): string {
  const root: Record<string, any> = {};
  for (const f of stats.largestFiles.concat(
    stats.byExtension.flatMap(() => []),
  )) {
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
  return renderTreeNode(root, 0);
}

function renderTreeNode(node: Record<string, any>, depth: number): string {
  const entries = Object.entries(node).sort(([a, av], [b, bv]) => {
    const aIsFile = !!(av as any).__file;
    const bIsFile = !!(bv as any).__file;
    if (aIsFile !== bIsFile) return aIsFile ? 1 : -1;
    return a.localeCompare(b);
  });
  let html = "";
  for (const [name, child] of entries) {
    const file = (child as any).__file;
    if (file) {
      html += `<li class="tree-file"><span class="tree-icon">${fileIcon()}</span><span class="tree-name">${esc(name)}</span><span class="tree-meta">${formatBytes(file.size)}</span></li>`;
    } else {
      html += `<li class="tree-dir"><details${depth < 1 ? " open" : ""}><summary><span class="tree-icon">${folderIcon()}</span><span class="tree-name">${esc(name)}</span></summary><ul>${renderTreeNode(child as any, depth + 1)}</ul></details></li>`;
    }
  }
  return html;
}

function folderIcon(): string {
  return `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="#f4b740" d="M1.5 3A1.5 1.5 0 0 1 3 1.5h3.379a1.5 1.5 0 0 1 1.06.44L8.5 3h4A1.5 1.5 0 0 1 14 4.5v8A1.5 1.5 0 0 1 12.5 14h-9A1.5 1.5 0 0 1 2 12.5v-9z"/></svg>`;
}

function fileIcon(): string {
  return `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="#9aa6b9" d="M3 1.5A1.5 1.5 0 0 1 4.5 0h5L13 3.5v11A1.5 1.5 0 0 1 11.5 16h-7A1.5 1.5 0 0 1 3 14.5v-13zM9 1v3h3L9 1z"/></svg>`;
}

export function renderReport(stats: RepoStats): string {
  const maxExtFiles = Math.max(1, ...stats.byExtension.map((e) => e.files));
  const maxDirFiles = Math.max(1, ...stats.topDirectories.map((d) => d.files));
  const maxFileSize = Math.max(1, ...stats.largestFiles.map((f) => f.size));

  const extRows = stats.byExtension
    .slice(0, 20)
    .map(
      (e) => `
        <tr>
          <td><span class="ext-chip ${badgeForExt(e.ext)}">${esc(e.ext)}</span></td>
          <td class="num">${e.files}</td>
          <td>${bar(e.files, maxExtFiles, "neutral")}</td>
          <td class="num">${formatBytes(e.bytes)}</td>
          <td class="num">${e.lines.toLocaleString()}</td>
        </tr>`,
    )
    .join("");

  const dirRows = stats.topDirectories
    .map(
      (d) => `
        <tr>
          <td class="mono">${esc(d.dir)}</td>
          <td class="num">${d.files}</td>
          <td>${bar(d.files, maxDirFiles, "neutral")}</td>
          <td class="num">${formatBytes(d.bytes)}</td>
        </tr>`,
    )
    .join("");

  const largeRows = stats.largestFiles
    .map(
      (f) => `
        <tr>
          <td class="mono path">${esc(f.relPath)}</td>
          <td class="num">${formatBytes(f.size)}</td>
          <td>${bar(f.size, maxFileSize, "warn")}</td>
        </tr>`,
    )
    .join("");

  const notableList = stats.notableFiles.length
    ? stats.notableFiles
        .map(
          (n) =>
            `<li><span class="chip">${esc(n.name)}</span><span class="mono dim">${esc(n.relPath)}</span><span class="dim">${formatBytes(n.size)}</span></li>`,
        )
        .join("")
    : `<li class="dim">No standard project files detected.</li>`;

  const tree = buildTree(stats);

  const avgSize = stats.totalFiles ? Math.round(stats.totalBytes / stats.totalFiles) : 0;
  const avgLines = stats.totalFiles ? Math.round(stats.totalLines / stats.totalFiles) : 0;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Lumen — ${esc(stats.rootName)}</title>
<style>
  :root {
    --bg: #f7f8fb;
    --panel: #ffffff;
    --panel-soft: #fafbfd;
    --border: #e4e8ef;
    --border-strong: #d3d8e2;
    --text: #1d2330;
    --text-soft: #4b5365;
    --dim: #8993a6;
    --accent: #2f6df3;
    --accent-soft: #eaf1ff;
    --green: #1f9d61;
    --amber: #d98316;
    --red: #d04848;
    --violet: #7a5cf0;
    --teal: #11a39c;
    --rose: #d3528a;
    --slate: #5f6b80;
    --blue: #2f6df3;
    --shadow: 0 1px 2px rgba(20,30,55,0.04), 0 4px 14px rgba(20,30,55,0.04);
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.55;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 1240px; margin: 0 auto; padding: 36px 32px 56px; }

  header.top { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin-bottom: 28px; }
  header.top .title h1 { margin: 0; font-size: 26px; font-weight: 600; letter-spacing: -0.01em; }
  header.top .title .sub { color: var(--dim); font-size: 13px; margin-top: 6px; }
  header.top .title .sub b { color: var(--text-soft); font-weight: 500; }
  header.top .meta { display: flex; gap: 10px; align-items: center; flex-shrink: 0; }

  .pill {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 6px 12px; border-radius: 999px;
    background: var(--panel); border: 1px solid var(--border);
    font-size: 13px; color: var(--text-soft);
  }
  .pill.warn { color: var(--red); border-color: #f3c8c8; background: #fdf2f2; }
  .pill.good { color: var(--green); border-color: #c8e7d6; background: #f0faf4; }

  .tabs { display: flex; gap: 26px; border-bottom: 1px solid var(--border); margin-bottom: 22px; }
  .tab { padding: 10px 0; font-size: 14px; color: var(--dim); cursor: default; position: relative; font-weight: 500; }
  .tab.active { color: var(--accent); }
  .tab.active::after {
    content: ""; position: absolute; left: 0; right: 0; bottom: -1px;
    height: 2px; background: var(--accent); border-radius: 2px;
  }

  .grid-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
  .stat {
    background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 18px 20px;
    box-shadow: var(--shadow);
  }
  .stat .row { display: flex; align-items: center; gap: 10px; color: var(--text-soft); font-size: 13px; font-weight: 500; }
  .stat .row svg { flex-shrink: 0; }
  .stat .value { font-size: 28px; font-weight: 700; margin-top: 10px; letter-spacing: -0.01em; }
  .stat .value.green { color: var(--green); }
  .stat .value.amber { color: var(--amber); }
  .stat .value.blue { color: var(--blue); }
  .stat .value.red { color: var(--red); }
  .stat .foot { color: var(--dim); font-size: 12px; margin-top: 6px; }

  .layout { display: grid; grid-template-columns: 360px 1fr; gap: 20px; }
  @media (max-width: 1000px) { .layout { grid-template-columns: 1fr; } }

  .panel {
    background: var(--panel); border: 1px solid var(--border); border-radius: 12px;
    box-shadow: var(--shadow);
    overflow: hidden;
  }
  .panel-head {
    padding: 14px 18px; border-bottom: 1px solid var(--border);
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    font-size: 13px; color: var(--text-soft); font-weight: 500;
  }
  .panel-head .counts { display: flex; gap: 14px; font-size: 13px; }
  .panel-head .counts b { font-weight: 600; }
  .panel-head .counts .ok { color: var(--green); }
  .panel-head .counts .warn { color: var(--amber); }
  .panel-body { padding: 6px 0; max-height: 560px; overflow: auto; }

  .tree, .tree ul {
    list-style: none; margin: 0; padding: 0;
  }
  .tree ul { padding-left: 18px; }
  .tree li { font-size: 13px; }
  .tree-file, .tree-dir > details > summary {
    display: flex; align-items: center; gap: 8px; padding: 4px 18px;
    border-radius: 6px;
  }
  .tree-file:hover, .tree-dir > details > summary:hover {
    background: var(--accent-soft);
  }
  .tree-dir > details > summary {
    list-style: none; cursor: pointer; user-select: none;
    font-weight: 500; color: var(--text);
  }
  .tree-dir > details > summary::-webkit-details-marker { display: none; }
  .tree-dir > details > summary::before {
    content: "▸"; color: var(--dim); font-size: 10px; width: 10px; transition: transform 0.15s ease;
  }
  .tree-dir > details[open] > summary::before { content: "▾"; }
  .tree-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tree-meta { color: var(--dim); font-size: 12px; font-variant-numeric: tabular-nums; }
  .tree-icon { display: inline-flex; align-items: center; }

  .sections { display: flex; flex-direction: column; gap: 16px; }
  .panel-body.tight { padding: 0; }
  table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
  th, td { text-align: left; padding: 10px 18px; border-bottom: 1px solid var(--border); }
  thead th { font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--dim); font-weight: 600; background: var(--panel-soft); }
  tr:last-child td { border-bottom: none; }
  tbody tr:hover { background: var(--panel-soft); }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12.5px; color: var(--text-soft); }
  .path { max-width: 520px; overflow: hidden; text-overflow: ellipsis; }
  .dim { color: var(--dim); }

  .bar { background: #eef1f6; border-radius: 4px; height: 6px; min-width: 100px; overflow: hidden; }
  .bar-fill { height: 100%; background: var(--accent); border-radius: 4px; }
  .bar-warn .bar-fill { background: linear-gradient(90deg, var(--amber), var(--red)); }
  .bar-good .bar-fill { background: var(--green); }

  .ext-chip {
    display: inline-block; padding: 2px 9px; border-radius: 6px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px;
    background: #eef1f6; color: var(--text-soft); border: 1px solid transparent;
  }
  .ext-chip.tone-blue { background: #e8f0ff; color: #2557d6; }
  .ext-chip.tone-amber { background: #fff3df; color: #a35d0f; }
  .ext-chip.tone-violet { background: #f1ecff; color: #5a3ecf; }
  .ext-chip.tone-teal { background: #e1f5f3; color: #0e7a73; }
  .ext-chip.tone-rose { background: #fde9f1; color: #b03a72; }
  .ext-chip.tone-slate { background: #eef1f6; color: var(--slate); }

  ul.notable { list-style: none; padding: 0; margin: 0; }
  ul.notable li { display: flex; align-items: center; gap: 10px; padding: 8px 18px; border-bottom: 1px solid var(--border); font-size: 13.5px; }
  ul.notable li:last-child { border-bottom: none; }
  .chip {
    background: var(--accent-soft); color: var(--accent);
    padding: 2px 8px; border-radius: 6px; font-size: 12px; font-weight: 500;
  }

  footer { margin-top: 28px; color: var(--dim); font-size: 12px; text-align: center; }

  @media (max-width: 760px) {
    .grid-stats { grid-template-columns: repeat(2, 1fr); }
    .wrap { padding: 24px 16px 40px; }
  }
</style>
</head>
<body>
<div class="wrap">
  <header class="top">
    <div class="title">
      <h1>Repository Report</h1>
      <div class="sub">Repository: <b>${esc(stats.rootName)}</b> · ${esc(stats.root)}</div>
      <div class="sub">Scanned ${esc(stats.scannedAt)}</div>
    </div>
    <div class="meta">
      <span class="pill">📁 ${stats.totalFiles.toLocaleString()} files</span>
      <span class="pill good">lumen</span>
    </div>
  </header>

  <div class="tabs">
    <div class="tab active">Overview</div>
    <div class="tab">File Types</div>
    <div class="tab">Directories</div>
  </div>

  <div class="grid-stats">
    <div class="stat">
      <div class="row">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2f6df3" stroke-width="2"><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>
        Total Files
      </div>
      <div class="value blue">${stats.totalFiles.toLocaleString()}</div>
      <div class="foot">${stats.byExtension.length} distinct extensions</div>
    </div>
    <div class="stat">
      <div class="row">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4b5365" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
        Total Size
      </div>
      <div class="value">${formatBytes(stats.totalBytes)}</div>
      <div class="foot">avg ${formatBytes(avgSize)} per file</div>
    </div>
    <div class="stat">
      <div class="row">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1f9d61" stroke-width="2"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>
        Lines of Code
      </div>
      <div class="value green">${stats.totalLines.toLocaleString()}</div>
      <div class="foot">avg ${avgLines.toLocaleString()} per file</div>
    </div>
    <div class="stat">
      <div class="row">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d04848" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>
        Ignored Paths
      </div>
      <div class="value red">${stats.ignored.length}</div>
      <div class="foot">node_modules, .git, build dirs…</div>
    </div>
  </div>

  <div class="layout">
    <aside class="panel">
      <div class="panel-head">
        <span>File Tree</span>
        <span class="counts">
          <span><b>${stats.largestFiles.length}</b> shown</span>
        </span>
      </div>
      <div class="panel-body">
        <ul class="tree">${tree}</ul>
      </div>
    </aside>

    <div class="sections">
      <section class="panel">
        <div class="panel-head"><span>Notable Files</span></div>
        <div class="panel-body tight"><ul class="notable">${notableList}</ul></div>
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

  <footer>Generated by <b>lumen</b> · static HTML, no JS required</footer>
</div>
</body>
</html>`;
}
