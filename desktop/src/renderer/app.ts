interface FileEntry { relPath: string; size: number; lines: number; ext: string; }
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

interface CoverageMetric { total: number; covered: number; pct: number; }
interface FileCoverage {
  path: string;
  lines: CoverageMetric; statements: CoverageMetric;
  functions: CoverageMetric; branches: CoverageMetric;
  uncoveredLines?: number[];
}
interface CoverageReport {
  root: string;
  framework: string;
  sources: string[];
  total: { lines: CoverageMetric; statements: CoverageMetric; functions: CoverageMetric; branches: CoverageMetric };
  files: FileCoverage[];
}

interface AiSummary { model: string; text: string; }

type Provider = "ollama" | "openai" | "anthropic";
interface ProbeResult { provider: Provider; available: boolean; models: string[]; hint?: string; }
interface Settings {
  openaiApiKey: string; anthropicApiKey: string;
  ollamaUrl: string; defaultTestCommand: string;
  recentRepos: string[];
}

interface GitDiffResult { files: string[]; base: string; current: string; }

interface LumenApi {
  pickDirectory: () => Promise<string | null>;
  scanRepo: (dir: string) => Promise<RepoStats>;
  scanCoverage: (dir: string) => Promise<{ framework: string; coverage: CoverageReport | null }>;
  exportReport: (args: { stats: RepoStats; coverage: CoverageReport | null; ai: AiSummary | null; format: "html" | "markdown" | "json" }) => Promise<string | null>;
  reveal: (filePath: string) => Promise<void>;
  openPath: (p: string) => Promise<void>;
  gitIsRepo: (dir: string) => Promise<boolean>;
  gitChangedFiles: (dir: string, base?: string) => Promise<GitDiffResult | null>;
  getSettings: () => Promise<Settings>;
  setSettings: (s: Partial<Settings>) => Promise<Settings>;
  addRecent: (dir: string) => Promise<string[]>;
  runTests: (args: { id: string; cmd: string; cwd: string }) => Promise<{ code: number; durationMs: number }>;
  cancelTests: (id: string) => Promise<void>;
  onTestChunk: (cb: (msg: { id: string; stream: "stdout" | "stderr"; chunk: string }) => void) => () => void;
  aiProbe: () => Promise<ProbeResult[]>;
  aiSummarize: (args: { id: string; provider: Provider; model: string; prompt: string }) => Promise<{ text: string }>;
  aiCancel: (id: string) => Promise<void>;
  onAiDelta: (cb: (msg: { id: string; delta: string }) => void) => () => void;
}

declare global { interface Window { lumen: LumenApi } }
export {};

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

// header
const btnOpen = $("#btn-open") as HTMLButtonElement;
const btnOpenEmpty = $("#btn-open-empty") as HTMLButtonElement;
const btnRecent = $("#btn-recent") as HTMLButtonElement;
const recentMenu = $("#recent-menu") as HTMLDivElement;
const btnExport = $("#btn-export") as HTMLButtonElement;
const exportMenu = $("#export-menu") as HTMLDivElement;
const btnSettings = $("#btn-settings") as HTMLButtonElement;

// workspace
const emptyEl = $("#empty") as HTMLElement;
const workspaceEl = $("#workspace") as HTMLElement;
const reportEl = $("#report") as HTMLElement;
const toastEl = $("#toast") as HTMLElement;

// test panel
const testCmd = $("#test-cmd") as HTMLInputElement;
const btnTestRun = $("#btn-test-run") as HTMLButtonElement;
const btnTestCancel = $("#btn-test-cancel") as HTMLButtonElement;
const btnTestClear = $("#btn-test-clear") as HTMLButtonElement;
const testConsole = $("#test-console") as HTMLDivElement;
const testStatus = $("#test-status") as HTMLElement;
const testFrameworkEl = $("#test-framework") as HTMLElement;

// ai panel
const aiProvider = $("#ai-provider") as HTMLSelectElement;
const aiModel = $("#ai-model") as HTMLSelectElement;
const btnAiRun = $("#btn-ai-run") as HTMLButtonElement;
const btnAiCancel = $("#btn-ai-cancel") as HTMLButtonElement;
const aiOut = $("#ai-out") as HTMLDivElement;
const aiStatus = $("#ai-status") as HTMLElement;

// settings modal
const settingsOverlay = $("#settings-overlay") as HTMLElement;
const settingsClose = $("#settings-close") as HTMLButtonElement;
const settingsSave = $("#settings-save") as HTMLButtonElement;
const setOpenai = $("#set-openai") as HTMLInputElement;
const setAnthropic = $("#set-anthropic") as HTMLInputElement;
const setOllama = $("#set-ollama") as HTMLInputElement;
const setTest = $("#set-test") as HTMLInputElement;

// dnd
const dndOverlay = $("#dnd-overlay") as HTMLElement;

// diff coverage
const diffRow = $("#diff-row") as HTMLElement;
const chkDiff = $("#chk-diff") as HTMLInputElement;
const diffHint = $("#diff-hint") as HTMLElement;

// state
let currentStats: RepoStats | null = null;
let currentCoverage: CoverageReport | null = null;
let currentDiff: GitDiffResult | null = null;
let isGitRepo = false;
let currentAi: AiSummary | null = null;
let currentRepo: string | null = null;
let probes: ProbeResult[] = [];
let settings: Settings = {
  openaiApiKey: "", anthropicApiKey: "",
  ollamaUrl: "http://localhost:11434",
  defaultTestCommand: "npm test",
  recentRepos: [],
};
let testRunning = false;
let aiRunning = false;

// utilities
function esc(s: string) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
function bar(value: number, max: number, tone: "neutral" | "warn" = "neutral") {
  const pct = max === 0 ? 0 : Math.round((value / max) * 100);
  return `<div class="bar bar-${tone}"><div class="bar-fill" style="width:${pct}%"></div></div>`;
}
function extTone(ext: string) {
  const t: Record<string, string> = { ".ts": "tone-blue", ".tsx": "tone-blue", ".js": "tone-amber", ".jsx": "tone-amber", ".md": "tone-violet", ".html": "tone-rose", ".css": "tone-teal" };
  return t[ext] || "";
}
function toast(msg: string, ms = 2400) {
  toastEl.textContent = msg;
  toastEl.classList.remove("hidden");
  setTimeout(() => toastEl.classList.add("hidden"), ms);
}
function uid() { return Math.random().toString(36).slice(2, 10); }
function pct(n: number) { return `${n.toFixed(1)}%`; }
function covTone(p: number): "good" | "warn" | "bad" {
  if (p >= 80) return "good";
  if (p >= 60) return "warn";
  return "bad";
}
function providerLabel(p: Provider) {
  return p === "ollama" ? "Ollama (local)" : p === "openai" ? "OpenAI" : "Anthropic";
}

// ----- repository scanning -----
function showScanning(dir: string) {
  emptyEl.classList.add("hidden");
  workspaceEl.classList.remove("hidden");
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
      if (isLeaf) node[part] = { __file: f };
      else { node[part] = node[part] || {}; node = node[part]; }
    }
  }
  return renderTree(root, 0);
}
function renderTree(node: Record<string, any>, depth: number): string {
  const entries = Object.entries(node).sort(([a, av], [b, bv]) => {
    const af = !!(av as any).__file, bf = !!(bv as any).__file;
    if (af !== bf) return af ? 1 : -1;
    return a.localeCompare(b);
  });
  let html = "";
  for (const [name, child] of entries) {
    const file = (child as any).__file;
    if (file) {
      html += `<li class="tree-file"><span class="tree-name">${esc(name)}</span><span class="tree-meta">${fmtBytes(file.size)}</span></li>`;
    } else {
      html += `<li class="tree-dir"><details${depth < 1 ? " open" : ""}><summary><span class="tree-name">${esc(name)}</span></summary><ul>${renderTree(child as any, depth + 1)}</ul></details></li>`;
    }
  }
  return html;
}

function renderCoverageCards(cov: CoverageReport, diff: GitDiffResult | null): string {
  const card = (label: string, m: CoverageMetric) => `
    <div class="stat">
      <div class="row">${label}</div>
      <div class="value cov-${covTone(m.pct)}">${pct(m.pct)}</div>
      <div class="foot">${m.covered.toLocaleString()} / ${m.total.toLocaleString()} covered</div>
    </div>`;
  const diffBadge = diff
    ? `<span class="pill" title="${esc(diff.files.length + " changed files vs " + diff.base)}">diff · ${diff.files.length} files</span>`
    : "";
  return `
    <section class="panel cov-panel">
      <div class="panel-head"><span>Test Coverage <span class="dim">· ${esc(cov.framework)}</span></span><span class="dim">${diffBadge} ${cov.files.length} files</span></div>
      <div class="panel-body tight" style="padding:14px 16px;">
        <div class="grid-stats">
          ${card("Lines", cov.total.lines)}
          ${card("Statements", cov.total.statements)}
          ${card("Functions", cov.total.functions)}
          ${card("Branches", cov.total.branches)}
        </div>
      </div>
    </section>`;
}

function renderCoverageTable(cov: CoverageReport, diff: GitDiffResult | null): string {
  const changedSet = diff ? new Set(diff.files.map((f) => f.replace(/\\/g, "/"))) : null;
  const rows = cov.files.slice().sort((a, b) => a.lines.pct - b.lines.pct).slice(0, 50)
    .map((f) => {
      const isChanged = changedSet && [...changedSet].some((c) => {
        const p = f.path.replace(/\\/g, "/");
        return p === c || p.endsWith("/" + c) || c.endsWith("/" + p);
      });
      return `
      <tr${isChanged ? ' class="diff-changed"' : ""}>
        <td class="mono path">${esc(f.path)}${isChanged ? ' <span class="chip diff-chip">changed</span>' : ""}</td>
        <td class="num cov-${covTone(f.lines.pct)}">${pct(f.lines.pct)}</td>
        <td class="num cov-${covTone(f.statements.pct)}">${pct(f.statements.pct)}</td>
        <td class="num cov-${covTone(f.functions.pct)}">${pct(f.functions.pct)}</td>
        <td class="num cov-${covTone(f.branches.pct)}">${pct(f.branches.pct)}</td>
      </tr>`;
    }).join("");
  const heading = diff ? `Changed files coverage <span class="dim">· ${diff.current} vs ${esc(diff.base)}</span>` : "Per-file Coverage";
  return `
    <section class="panel">
      <div class="panel-head"><span>${heading}</span><span class="dim">${cov.files.length} files · lowest first</span></div>
      <div class="panel-body tight">
        <table>
          <thead><tr><th>File</th><th class="num">Lines</th><th class="num">Stmts</th><th class="num">Fns</th><th class="num">Brs</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>`;
}

function renderAiBlock(ai: AiSummary): string {
  const paras = ai.text.split(/\n{2,}/).map((p) => `<p>${esc(p.trim()).replace(/\n/g, "<br>")}</p>`).join("");
  return `
    <section class="panel ai-panel">
      <div class="panel-head"><span>AI Analysis <span class="dim">· ${esc(ai.model)}</span></span><span class="dim">local · streamed</span></div>
      <div class="panel-body" style="padding:14px 18px; font-size:14px; line-height:1.6;">${paras}</div>
    </section>`;
}

function filterCoverageByDiff(cov: CoverageReport, diff: GitDiffResult): CoverageReport {
  const changedSet = new Set(diff.files.map((f) => f.replace(/\\/g, "/")));
  const files = cov.files.filter((f) => {
    const p = f.path.replace(/\\/g, "/");
    if (changedSet.has(p)) return true;
    for (const c of changedSet) {
      if (p.endsWith("/" + c) || c.endsWith("/" + p)) return true;
    }
    return false;
  });
  if (files.length === 0) return cov; // no match → fall back to all
  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
  const p = (c: number, t: number) => (t === 0 ? 100 : Math.round((c / t) * 1000) / 10);
  const total = {
    lines:      { total: sum(files.map(f => f.lines.total)),      covered: sum(files.map(f => f.lines.covered)),      pct: p(sum(files.map(f => f.lines.covered)),      sum(files.map(f => f.lines.total))) },
    statements: { total: sum(files.map(f => f.statements.total)), covered: sum(files.map(f => f.statements.covered)), pct: p(sum(files.map(f => f.statements.covered)), sum(files.map(f => f.statements.total))) },
    functions:  { total: sum(files.map(f => f.functions.total)),  covered: sum(files.map(f => f.functions.covered)),  pct: p(sum(files.map(f => f.functions.covered)),  sum(files.map(f => f.functions.total))) },
    branches:   { total: sum(files.map(f => f.branches.total)),   covered: sum(files.map(f => f.branches.covered)),   pct: p(sum(files.map(f => f.branches.covered)),   sum(files.map(f => f.branches.total))) },
  };
  return { ...cov, files, total };
}

function renderReportUi() {
  if (!currentStats) return;
  const stats = currentStats;
  btnExport.disabled = false;
  btnAiRun.disabled = !probes.some((p) => p.available);

  const useDiff = chkDiff.checked && isGitRepo && currentDiff !== null;
  const displayCoverage = useDiff && currentCoverage && currentDiff
    ? filterCoverageByDiff(currentCoverage, currentDiff)
    : currentCoverage;

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
      <td class="num">${fmtBytes(e.bytes)}</td>
      <td class="num">${e.lines.toLocaleString()}</td>
    </tr>`).join("");
  const dirRows = stats.topDirectories.map((d) => `
    <tr>
      <td class="mono">${esc(d.dir)}</td>
      <td class="num">${d.files}</td>
      <td>${bar(d.files, maxDirFiles)}</td>
      <td class="num">${fmtBytes(d.bytes)}</td>
    </tr>`).join("");
  const largeRows = stats.largestFiles.map((f) => `
    <tr>
      <td class="mono path">${esc(f.relPath)}</td>
      <td class="num">${fmtBytes(f.size)}</td>
      <td>${bar(f.size, maxFileSize, "warn")}</td>
    </tr>`).join("");
  const notable = stats.notableFiles.length
    ? stats.notableFiles.map((n) => `<li><span class="chip">${esc(n.name)}</span><span class="mono dim">${esc(n.relPath)}</span><span class="dim">${fmtBytes(n.size)}</span></li>`).join("")
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
        <span class="pill good">${fmtBytes(stats.totalBytes)}</span>
      </div>
    </header>

    ${currentAi ? renderAiBlock(currentAi) : ""}
    ${displayCoverage ? renderCoverageCards(displayCoverage, useDiff && currentDiff ? currentDiff : null) : ""}

    <div class="grid-stats">
      <div class="stat"><div class="row">Total Files</div><div class="value blue">${stats.totalFiles.toLocaleString()}</div><div class="foot">${stats.byExtension.length} distinct extensions</div></div>
      <div class="stat"><div class="row">Total Size</div><div class="value">${fmtBytes(stats.totalBytes)}</div><div class="foot">avg ${fmtBytes(avgSize)} per file</div></div>
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
          <div class="panel-body tight"><table>
            <thead><tr><th>Extension</th><th class="num">Files</th><th></th><th class="num">Size</th><th class="num">Lines</th></tr></thead>
            <tbody>${extRows}</tbody>
          </table></div>
        </section>
        <section class="panel">
          <div class="panel-head"><span>Top Directories</span></div>
          <div class="panel-body tight"><table>
            <thead><tr><th>Directory</th><th class="num">Files</th><th></th><th class="num">Size</th></tr></thead>
            <tbody>${dirRows}</tbody>
          </table></div>
        </section>
        <section class="panel">
          <div class="panel-head"><span>Largest Files</span></div>
          <div class="panel-body tight"><table>
            <thead><tr><th>Path</th><th class="num">Size</th><th></th></tr></thead>
            <tbody>${largeRows}</tbody>
          </table></div>
        </section>
        ${displayCoverage ? renderCoverageTable(displayCoverage, useDiff && currentDiff ? currentDiff : null) : ""}
      </div>
    </div>
  `;
}

async function openRepository(dir?: string) {
  const target = dir || await window.lumen.pickDirectory();
  if (!target) return;
  currentRepo = target;
  currentCoverage = null;
  currentDiff = null;
  isGitRepo = false;
  currentAi = null;
  chkDiff.checked = false;
  diffRow.style.display = "none";
  showScanning(target);

  try {
    const stats = await window.lumen.scanRepo(target);
    currentStats = stats;
  } catch (err) {
    toast(`Scan failed: ${(err as Error).message}`);
    emptyEl.classList.remove("hidden");
    workspaceEl.classList.add("hidden");
    return;
  }

  try {
    const cov = await window.lumen.scanCoverage(target);
    currentCoverage = cov.coverage;
    testFrameworkEl.textContent = cov.framework;
  } catch {
    currentCoverage = null;
    testFrameworkEl.textContent = "unknown";
  }

  // git detection — non-fatal
  try {
    isGitRepo = await window.lumen.gitIsRepo(target);
    if (isGitRepo) {
      const diff = await window.lumen.gitChangedFiles(target);
      currentDiff = diff;
      if (diff) {
        diffRow.style.display = "";
        diffHint.textContent = `${diff.files.length} changed vs ${diff.base}`;
        if (diff.files.length > 0) chkDiff.checked = true;
      }
    }
  } catch {
    isGitRepo = false;
    currentDiff = null;
  }

  renderReportUi();

  // add to recents — non-fatal
  try {
    settings.recentRepos = await window.lumen.addRecent(target);
    refreshRecent();
  } catch {
    // recents are nice-to-have
  }
}

chkDiff.addEventListener("change", () => {
  if (!isGitRepo) { chkDiff.checked = false; return; }
  renderReportUi();
});

async function exportReport(format: "html" | "markdown" | "json") {
  if (!currentStats) return;
  try {
    const filePath = await window.lumen.exportReport({
      stats: currentStats,
      coverage: currentCoverage,
      ai: currentAi,
      format,
    });
    if (filePath) {
      toast(`Saved: ${filePath}`);
      try { window.lumen.reveal(filePath); } catch { /* reveal is cosmetic */ }
    }
  } catch (err) {
    toast(`Save failed: ${(err as Error).message}`, 4000);
  }
}

// ----- recents -----
function refreshRecent() {
  recentMenu.innerHTML = "";
  if (!settings.recentRepos.length) {
    btnRecent.disabled = true;
    return;
  }
  btnRecent.disabled = false;
  for (const r of settings.recentRepos) {
    const b = document.createElement("button");
    b.className = "menu-item";
    b.textContent = r;
    b.title = r;
    b.addEventListener("click", () => {
      recentMenu.classList.add("hidden");
      openRepository(r);
    });
    recentMenu.appendChild(b);
  }
}

// ----- test runner -----
let testRunId: string | null = null;
const unsubTestChunk = window.lumen.onTestChunk((msg) => {
  if (msg.id !== testRunId) return;
  appendConsole(msg.chunk, msg.stream);
});

function appendConsole(text: string, stream: "stdout" | "stderr" = "stdout") {
  const atBottom = testConsole.scrollTop + testConsole.clientHeight >= testConsole.scrollHeight - 20;
  const span = document.createElement("span");
  span.className = stream === "stderr" ? "err" : "";
  span.textContent = text;
  testConsole.appendChild(span);
  if (atBottom) testConsole.scrollTop = testConsole.scrollHeight;
}

btnTestRun.addEventListener("click", async () => {
  if (!currentRepo) { toast("Open a repository first."); return; }
  const cmd = testCmd.value.trim() || settings.defaultTestCommand || "npm test";
  testCmd.value = cmd;
  testRunning = true;
  btnTestRun.disabled = true;
  btnTestCancel.disabled = false;
  testStatus.textContent = `running: ${cmd}`;
  testRunId = uid();
  appendConsole(`\n$ ${cmd}\n`);
  try {
    const res = await window.lumen.runTests({ id: testRunId, cmd, cwd: currentRepo });
    testStatus.textContent = `${res.code === 0 ? "passed" : "exited with " + res.code} in ${(res.durationMs / 1000).toFixed(1)}s`;
    // refresh coverage + diff after tests
    if (currentRepo) {
      try {
        const cov = await window.lumen.scanCoverage(currentRepo);
        currentCoverage = cov.coverage;
        testFrameworkEl.textContent = cov.framework;
      } catch { /* keep previous coverage */ }
      if (isGitRepo) {
        try {
          currentDiff = await window.lumen.gitChangedFiles(currentRepo);
          if (currentDiff) diffHint.textContent = `${currentDiff.files.length} changed vs ${currentDiff.base}`;
        } catch { /* diff is optional */ }
      }
      renderReportUi();
    }
  } catch (err) {
    testStatus.textContent = `error: ${(err as Error).message}`;
  } finally {
    testRunning = false;
    btnTestRun.disabled = false;
    btnTestCancel.disabled = true;
  }
});

btnTestCancel.addEventListener("click", () => {
  if (testRunId) window.lumen.cancelTests(testRunId);
});
btnTestClear.addEventListener("click", () => { testConsole.innerHTML = ""; });

// ----- AI panel -----
function buildAiPrompt(): string {
  const lines: string[] = [];
  if (currentStats) {
    lines.push(`Repository: ${currentStats.rootName}`);
    lines.push(`Files scanned: ${currentStats.totalFiles}, total LOC: ${currentStats.totalLines}`);
  }
  if (currentCoverage) {
    const c = currentCoverage;
    lines.push("");
    lines.push(`Coverage (${c.framework}):`);
    lines.push(`- Lines: ${pct(c.total.lines.pct)} (${c.total.lines.covered}/${c.total.lines.total})`);
    lines.push(`- Statements: ${pct(c.total.statements.pct)}`);
    lines.push(`- Functions: ${pct(c.total.functions.pct)}`);
    lines.push(`- Branches: ${pct(c.total.branches.pct)}`);
    const worst = c.files.slice().sort((a, b) => a.lines.pct - b.lines.pct).slice(0, 5);
    if (worst.length) {
      lines.push("");
      lines.push("Worst-covered files:");
      for (const f of worst) lines.push(`- ${f.path} — ${pct(f.lines.pct)} lines, ${pct(f.branches.pct)} branches`);
    }
  } else {
    lines.push("");
    lines.push("No coverage report found.");
  }
  lines.push("");
  lines.push("Write a short, plain-language report:\n1) One-paragraph summary of test health.\n2) Three prioritized, concrete suggestions.\nUnder 200 words. No code blocks. No preamble.");
  return lines.join("\n");
}

function refreshAiProviderOptions() {
  aiProvider.innerHTML = "";
  for (const pr of probes) {
    const opt = document.createElement("option");
    opt.value = pr.provider;
    opt.textContent = `${providerLabel(pr.provider)}${pr.available ? "" : " · " + (pr.hint || "unavailable")}`;
    if (!pr.available) opt.disabled = true;
    aiProvider.appendChild(opt);
  }
  const first = probes.find((p) => p.available);
  if (first) aiProvider.value = first.provider;
  refreshAiModelOptions();
  btnAiRun.disabled = !first || !currentStats;
}
function refreshAiModelOptions() {
  aiModel.innerHTML = "";
  const cur = probes.find((p) => p.provider === aiProvider.value);
  if (!cur) return;
  for (const m of cur.models) {
    const opt = document.createElement("option");
    opt.value = m; opt.textContent = m;
    aiModel.appendChild(opt);
  }
}
aiProvider.addEventListener("change", refreshAiModelOptions);

let aiRunId: string | null = null;
const unsubAiDelta = window.lumen.onAiDelta((msg) => {
  if (msg.id !== aiRunId) return;
  aiOut.textContent += msg.delta;
  aiOut.scrollTop = aiOut.scrollHeight;
});

btnAiRun.addEventListener("click", async () => {
  if (!currentStats) return;
  const provider = aiProvider.value as Provider;
  const model = aiModel.value;
  if (!provider || !model) return;
  aiRunning = true;
  btnAiRun.disabled = true;
  btnAiCancel.disabled = false;
  aiStatus.textContent = `${providerLabel(provider)} · ${model}`;
  aiOut.textContent = "";
  aiRunId = uid();
  try {
    const result = await window.lumen.aiSummarize({ id: aiRunId, provider, model, prompt: buildAiPrompt() });
    currentAi = { model: `${providerLabel(provider)} · ${model}`, text: result.text };
    aiStatus.textContent = `ready · ${result.text.length} chars`;
    renderReportUi();
  } catch (err) {
    aiStatus.textContent = `error: ${(err as Error).message}`;
  } finally {
    aiRunning = false;
    btnAiRun.disabled = false;
    btnAiCancel.disabled = true;
  }
});
btnAiCancel.addEventListener("click", () => { if (aiRunId) window.lumen.aiCancel(aiRunId); });

// ----- settings modal -----
btnSettings.addEventListener("click", () => {
  setOpenai.value = settings.openaiApiKey;
  setAnthropic.value = settings.anthropicApiKey;
  setOllama.value = settings.ollamaUrl;
  setTest.value = settings.defaultTestCommand;
  settingsOverlay.classList.remove("hidden");
});
settingsClose.addEventListener("click", () => settingsOverlay.classList.add("hidden"));
settingsSave.addEventListener("click", async () => {
  settings = await window.lumen.setSettings({
    openaiApiKey: setOpenai.value.trim(),
    anthropicApiKey: setAnthropic.value.trim(),
    ollamaUrl: setOllama.value.trim() || "http://localhost:11434",
    defaultTestCommand: setTest.value.trim() || "npm test",
  });
  settingsOverlay.classList.add("hidden");
  await refreshProbes();
  if (!testCmd.value) testCmd.value = settings.defaultTestCommand;
  toast("Settings saved");
});

async function refreshProbes() {
  probes = await window.lumen.aiProbe();
  refreshAiProviderOptions();
}

// ----- header dropdowns -----
btnExport.addEventListener("click", (e) => {
  e.stopPropagation();
  exportMenu.classList.toggle("hidden");
  recentMenu.classList.add("hidden");
});
btnRecent.addEventListener("click", (e) => {
  e.stopPropagation();
  recentMenu.classList.toggle("hidden");
  exportMenu.classList.add("hidden");
});
exportMenu.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  const fmt = target.getAttribute("data-fmt") as "html" | "markdown" | "json" | null;
  if (fmt) { exportMenu.classList.add("hidden"); exportReport(fmt); }
});
document.addEventListener("click", () => {
  exportMenu.classList.add("hidden");
  recentMenu.classList.add("hidden");
});

// ----- drag-and-drop -----
let dragDepth = 0;
window.addEventListener("dragenter", (e) => {
  e.preventDefault();
  dragDepth++;
  dndOverlay.classList.remove("hidden");
});
window.addEventListener("dragleave", () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) dndOverlay.classList.add("hidden");
});
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", async (e) => {
  e.preventDefault();
  dragDepth = 0;
  dndOverlay.classList.add("hidden");
  const files = Array.from(e.dataTransfer?.files || []);
  for (const f of files) {
    const p = (f as File & { path?: string }).path;
    if (p) { await openRepository(p); break; }
  }
});

// ----- top buttons -----
btnOpen.addEventListener("click", () => openRepository());
btnOpenEmpty.addEventListener("click", () => openRepository());

// ----- bootstrap -----
(async () => {
  settings = await window.lumen.getSettings();
  testCmd.value = settings.defaultTestCommand;
  refreshRecent();
  await refreshProbes();
})();

// keep tsc happy about unused unsubscribe symbols
void unsubTestChunk; void unsubAiDelta; void testRunning; void aiRunning;
