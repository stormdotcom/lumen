# Lumen — Full Guide

Everything you need to use, build, and extend Lumen.

## Table of contents

1. [What Lumen does](#what-lumen-does)
2. [Install the CLI](#install-the-cli)
3. [Using the CLI](#using-the-cli)
4. [Install the Desktop app](#install-the-desktop-app)
5. [Using the Desktop app](#using-the-desktop-app)
6. [What's in a report](#whats-in-a-report)
7. [Repo layout](#repo-layout)
8. [Building from source](#building-from-source)
9. [Building the desktop app](#building-the-desktop-app)
10. [Customizing the report](#customizing-the-report)
11. [Architecture](#architecture)
12. [Contributing](#contributing)
13. [Releasing](#releasing)
14. [Troubleshooting](#troubleshooting)

---

## What Lumen does

You point Lumen at a repository (any folder) and it:

- Reports total files, size, and lines of code
- Shows a per-extension rollup (`.ts`, `.py`, `.css`, …) with size + LOC bars
- Lists the top-level directory breakdown and the 15 largest files
- Detects notable files — `README`, `LICENSE`, `package.json`, `Dockerfile`, etc.
- Parses test coverage data (Istanbul `coverage-summary.json` / `lcov.info`)
- Filters coverage to only files changed in your branch (diff mode)
- Asks an LLM for a plain-language summary and concrete suggestions (AI analysis)

Reports are **self-contained single files** — no external CSS, no JS, no network calls.

Lumen ignores `node_modules`, `.git`, `dist`, `build`, `coverage`, `.next`, `__pycache__`, virtual envs, and similar folders by default.

---

## Install the CLI

```bash
npm install -g @ajmal_n/lumen-cli
```

Run without installing:

```bash
npx @ajmal_n/lumen-cli .
```

Requires Node.js **18 or newer**.

---

## Using the CLI

### Interactive menu (recommended)

```bash
lumen
```

Run with no arguments from any terminal. The menu is **persistent** — it returns after every action. Only selecting **Exit** (or pressing `Ctrl+C`) quits.

```
◆  lumen · interactive mode
│
◆  Repository path
│  /home/you/projects/myapp
│
◆  Test command (leave blank to skip)
│  npm test
│
◆  What would you like to do?
│  ● Coverage check · changed files (diff vs base branch)
│  ○ Coverage check · all files (full project)
│  ○ Run tests · generate HTML report
│  ○ Run tests · generate Markdown report
│  ○ Scan only (skip running tests)
│  ○ AI analysis · summary + suggestions
│  ○ Change repository path
│  ○ Change test command
│  ○ Exit
```

### CLI flags

```bash
lumen [path] [options]
```

`path` defaults to the current directory.

| Flag | Description | Default |
|---|---|---|
| `-f, --format <fmt>` | Output format: `html` or `markdown` / `md` | `html` |
| `-o, --out <dir>` | Output directory | `~/Downloads` |
| `-n, --name <name>` | Report filename without extension | `lumen-<repo>-<timestamp>` |
| `--diff [base]` | Coverage for changed files only (vs base branch) | off |
| `--all` | Full-project coverage — overrides `--diff` | off |
| `--coverage-dir <dir>` | Path to coverage directory (auto-discovered if omitted) | auto |
| `--no-coverage` | Skip coverage detection | off |
| `-t, --threshold <pct>` | Exit code `2` if line coverage is below this percent | none |
| `--print-path` | Print only the report file path (machine-readable) | off |
| `-V, --version` | Print version and exit | |
| `-h, --help` | Print help | |

### Examples

```bash
# Interactive menu
lumen

# Diff coverage — check only what you changed
lumen . --diff
lumen . --diff origin/develop
lumen . --diff -t 80           # fail if changed-file coverage < 80%

# Full project
lumen . --all
lumen . --all -t 80

# HTML report
lumen .
lumen ~/code/myapp --out ~/Desktop --name snapshot

# Markdown
lumen . -f md
lumen . -f md -o . -n COVERAGE   # → ./COVERAGE.md

# CI: generate report + gate on coverage
lumen . --all -f md -o . -n COVERAGE -t 80

# Skip coverage
lumen . --no-coverage
```

### Diff coverage

The default mode in git repos. Lumen compares your current branch against the base branch and shows coverage only for the files you changed:

```
Branch : feature/parser  →  origin/main
Changed: 3 files

src/parser/index.ts     ████████░░   82.00%  ⚠
src/util/string.ts      ██████░░░░   60.00%  ✗
src/util/array.ts       █████████░   90.00%  ✓

Total (changed files)   ████████░░   77.35%  ✗
  lines: 140/181  stmts: 140/181  fns: 16/22  branches: 30/44

✗ Below 80% threshold
```

**Failover chain** — diff mode degrades gracefully:

| Situation | What happens |
|---|---|
| Not a git repository | Warning → full-project coverage shown |
| `git` commands fail | Warning → full-project coverage shown |
| No changed files | Warning → full-project coverage shown |
| Changed files found but none in coverage data | Warning + file list → full-project coverage shown |

### Test coverage

Lumen reports coverage percentages using **industry-standard aggregation**: per-file, zero-denominator metrics (e.g. a file with no branches) are treated as **N/A** and excluded from the aggregate rather than counted as 100% covered. All percentages render with **2-decimal precision** (e.g. `82.00%`).

It also surfaces an **Untested source files** sidecar: source files (`.ts .tsx .js .jsx .mjs .cjs .py .go .rs .java .kt`) that have **no coverage data at all** are listed separately so you can see what your test runner never even touched. The sidecar is purely informational — it does not change the headline %.

Lumen detects your testing framework from `package.json` and config files, then finds `coverage-summary.json` and `lcov.info` on disk. Run your tests with coverage first:

```bash
# Jest
npx jest --coverage --coverageReporters=json-summary

# Vitest
npx vitest run --coverage --coverage.reporter=json-summary

# Nx
npx nx test myapp --coverage --coverageReporters=json-summary

# Mocha + nyc
npx nyc --reporter=json-summary mocha
```

Then run `lumen` — coverage cards (Lines / Statements / Functions / Branches), the worst-covered files, and a threshold pill all appear automatically.

### AI analysis

Lumen can send coverage **metrics** (no source code) to an LLM and return a plain-language summary and three prioritized suggestions.

**Supported providers:**

| Provider | How to enable |
|---|---|
| **Ollama** (local, free, private) | `ollama serve` + `ollama pull llama3.2` |
| **OpenAI** | `export OPENAI_API_KEY=sk-…` |
| **Anthropic** | `export ANTHROPIC_API_KEY=sk-ant-…` |

**Environment variable overrides:**

| Variable | Default |
|---|---|
| `LUMEN_OLLAMA_URL` | `http://localhost:11434` |
| `LUMEN_OLLAMA_MODEL` | auto |
| `OPENAI_BASE_URL` | `https://api.openai.com` |
| `LUMEN_OPENAI_MODEL` | `gpt-4o-mini` |
| `ANTHROPIC_BASE_URL` | `https://api.anthropic.com` |
| `LUMEN_ANTHROPIC_MODEL` | `claude-haiku-4-5-20251001` |

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Success |
| `1` | Invalid path, bad flag, or unexpected error |
| `2` | Coverage is below the `--threshold` value |

---

## Install the Desktop app

Download from the [Releases page](../../releases):

- **Windows** — `Lumen-Setup-<version>.exe` (NSIS installer) or `Lumen-<version>.exe` (portable)
- **Linux** — `Lumen-<version>.AppImage` or `.deb`

---

## Using the Desktop app

1. Launch **Lumen**.
2. Click **Open Repository…** (or drop a folder onto the window).
3. The report appears in the main panel — file breakdown, coverage cards, and per-file table.
4. In the **Tests** sidebar:
   - Enter a test command and click **Run** to stream test output live.
   - Check **Show diff coverage only** (available in git repos) to filter coverage to changed files only.
5. In the **AI Analysis** sidebar, pick a provider and model, then click **Generate summary**.
6. Use **Export ▾** to save the report as HTML or Markdown.

---

## What's in a report

| Section | Contents |
|---|---|
| **Summary** | Total files, total size, LOC, ignored dirs |
| **Notable files** | README, LICENSE, package.json, Dockerfile, etc. |
| **File types** | Top 20 extensions with file count, size, and LOC |
| **Top directories** | File count and size per top-level dir |
| **Largest files** | The 15 biggest files |
| **Test coverage** | Lines / Statements / Functions / Branches cards + per-file table |
| **AI Analysis** | Plain-language summary + suggestions (if requested) |

---

## Repo layout

```
lumen/
├── core/                @ajmal_n/lumen-core — shared scanner + renderers + coverage
│   ├── src/
│   │   ├── scanner.ts   walks the tree, builds RepoStats
│   │   ├── report.ts    RepoStats (+ CoverageReport + AiSummary) → HTML
│   │   ├── markdown.ts  RepoStats (+ CoverageReport + AiSummary) → GFM Markdown
│   │   ├── coverage.ts  framework detection + Istanbul/lcov parser
│   │   └── index.ts     re-exports
│   ├── tests/           Jest unit tests
│   ├── jest.config.js
│   ├── package.json
│   └── tsconfig.json
│
├── cli/                 @ajmal_n/lumen-cli — npm package + `lumen` binary
│   ├── src/
│   │   ├── index.ts     CLI entry (commander)
│   │   ├── menu.ts      Interactive menu (@clack/prompts)
│   │   ├── runner.ts    Test command spawner (streaming, bounded buffer)
│   │   ├── git.ts       git diff helpers (isGitRepo, getChangedFiles)
│   │   ├── util.ts      Coverage filter, diff report formatter, bar renderer
│   │   ├── paths.ts     OS-aware downloads dir
│   │   └── ollama.ts    Ollama probe + streaming summarizer
│   ├── README.md        Full CLI reference
│   ├── package.json
│   └── tsconfig.json
│
├── desktop/             lumen-desktop — Electron GUI
│   ├── src/
│   │   ├── main.ts          Electron main process (IPC handlers, git, AI)
│   │   ├── preload.ts       contextBridge → window.lumen
│   │   └── renderer/
│   │       ├── index.html   Shell UI
│   │       ├── app.ts       Renderer logic
│   │       └── styles.css   Light theme
│   ├── scripts/copy-assets.js
│   ├── package.json         (includes electron-builder config)
│   ├── tsconfig.json
│   └── tsconfig.renderer.json
│
├── .github/workflows/   ci.yml + release.yml
├── package.json         npm workspaces root
├── tsconfig.base.json   shared TS settings
├── README.md            Overview + quick start
├── GUIDE.md             this file
├── CONTRIBUTING.md
└── LICENSE
```

---

## Building from source

Requirements: Node.js **18 or newer**, npm **9 or newer**.

### Step 1 — Clone

```bash
git clone https://github.com/<you>/lumen.git
cd lumen
```

### Step 2 — Install dependencies

```bash
npm install
```

Creates workspace symlinks so `cli` and `desktop` import live `core` source without a rebuild dance.

### Step 3 — Build everything

```bash
npm run build
```

Compiles in order: `core` → `cli` → `desktop`. You can also build individually:

```bash
npm run build:core
npm run build:cli
npm run build:desktop
```

### Step 4 — Run it

```bash
# CLI
node cli/dist/index.js .
# or
npm run cli -- .

# Desktop
npm run desktop
```

### Step 5 — Install globally from source

```bash
npm install -g ./cli
# or
cd cli && npm link
```

To undo: `npm uninstall -g @ajmal_n/lumen-cli`

### Step 6 — Run tests

```bash
# core unit tests
npm run -w @ajmal_n/lumen-core test

# with coverage
npm run -w @ajmal_n/lumen-core test:coverage
```

### Cleaning up

```bash
npm run clean
```

---

## Building the desktop app

```bash
npm run -w lumen-desktop dist:win     # Windows NSIS installer + portable .exe
npm run -w lumen-desktop dist:linux   # Linux AppImage + .deb
npm run -w lumen-desktop dist:all     # Both
```

Output goes to `desktop/release/`.

**Cross-compiling notes:**
- Windows ↔ Linux generally works on either host.
- For Linux from Windows, use WSL2 with the standard Electron build deps.
- macOS builds require macOS for code signing.

---

## Customizing the report

**Visual changes** — edit `core/src/report.ts` (HTML) or `core/src/markdown.ts` (Markdown). CSS is inlined. Both the CLI and the desktop "Export" action call the same functions.

**Scan behavior** — edit `core/src/scanner.ts`:

- `DEFAULT_IGNORE` — directory names skipped entirely.
- `TEXT_EXTENSIONS` — extensions that get a line count.
- `NOTABLE_NAMES` — files surfaced in the "Notable files" section.

Then rebuild: `npm run build:core && npm run build:cli`

---

## Architecture

### Data flow

```
                ┌──────────────────────────────┐
                │      @ajmal_n/lumen-core      │
                │                              │
                │   scanRepo(path)             │
                │       └─► RepoStats          │
                │                              │
                │   findCoverage(path)         │
                │       └─► CoverageReport     │
                │                              │
                │   renderReport(stats, cov)   │
                │       └─► HTML string        │
                │                              │
                │   renderMarkdown(stats, cov) │
                │       └─► Markdown string    │
                └──────────────┬───────────────┘
                               │
          ┌────────────────────┴──────────────────┐
          │                                       │
          ▼                                       ▼
┌──────────────────────┐           ┌──────────────────────────────┐
│   @ajmal_n/lumen-cli │           │       lumen-desktop          │
│                      │           │                              │
│ argv → scan          │           │  main.ts                     │
│      → diff/coverage │           │   ├─ pickDirectory (IPC)     │
│      → AI analysis   │           │   ├─ scanRepo (IPC)          │
│      → render        │           │   ├─ runTests (IPC)          │
│      → fs.write      │           │   ├─ gitChangedFiles (IPC)   │
│                      │           │   ├─ aiSummarize (IPC)       │
│ Interactive menu     │           │   └─ exportReport (IPC)      │
│   @clack/prompts     │           │                              │
│   persistent loop    │           │  preload.ts (contextBridge)  │
└──────────────────────┘           │  renderer/app.ts             │
                                   └──────────────────────────────┘
```

### Key design decisions

- **Shared core** — scanner and renderers are in one package. CLI and desktop produce identical reports from the same code.
- **No framework in the renderer** — plain DOM + ES modules. No React, no Vue, no bundler for the renderer.
- **ESM/CJS interop** — `@clack/prompts` is ESM-only; the CLI loads it via a dynamic import shim so the CommonJS build stays clean.
- **Streaming scanner** — the scanner uses a min-heap for top-K largest files and streaming aggregation for extension/directory stats; it does not accumulate all entries in memory.
- **Graceful failover** — diff coverage falls back at every step rather than erroring out.

### Desktop security model

The renderer runs with `contextIsolation: true` and `nodeIntegration: false`. It can only call functions exposed by `preload.ts` via `contextBridge.exposeInMainWorld`. The HTML has a strict CSP that blocks remote scripts and stylesheets.

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Quick checklist:

```bash
git clone https://github.com/<you>/lumen.git
cd lumen
npm install
npm run build          # must pass
npm run -w @ajmal_n/lumen-core test   # must pass
# make your change
node cli/dist/index.js .   # sanity check
git checkout -b feat/<thing>
git commit -am "feat: <thing>"
# open a PR
```

**Code style:**
- TypeScript strict mode is on. Leave it on.
- No frameworks in the renderer. Plain DOM + ES modules.
- Prefer editing existing files over creating new ones.
- Run `npm run build` and `npm run -w @ajmal_n/lumen-core test` before opening a PR.

---

## Releasing

See `PUBLISHING.md` (gitignored) for the full checklist. Short version:

1. Bump versions in `core/package.json` and `cli/package.json`.
2. Update `cli/package.json` `dependencies["@ajmal_n/lumen-core"]` to match.
3. Build: `npm run build`
4. Publish: `cd core && npm publish --access public`, then `cd ../cli && npm publish --access public`
5. Tag: `git tag v0.x.y && git push --follow-tags`

The GitHub Actions `release.yml` workflow can automate steps 4–5 with an `NPM_TOKEN` repository secret.

---

## Troubleshooting

### `lumen: command not found` after global install

Your npm global bin directory isn't on `PATH`:

```bash
npm config get prefix
# Linux/macOS: add <prefix>/bin to PATH
# Windows: add <prefix> to PATH (usually %APPDATA%\npm)
```

### No coverage data found

Run your tests with a coverage reporter that writes `coverage-summary.json` (Istanbul) or `lcov.info` before running `lumen`:

```bash
npm test       # with --coverage
lumen . --diff
```

### Diff shows "no changed files"

You need commits on your branch relative to the base. If you're on `main` comparing to `origin/main`, there are no changes to diff — switch to a feature branch first.

### AI analysis is disabled / times out

For Ollama: ensure `ollama serve` is running and the model is pulled:

```bash
ollama serve
ollama pull llama3.2
```

For OpenAI / Anthropic: verify your key is exported in the current shell:

```bash
echo $OPENAI_API_KEY
echo $ANTHROPIC_API_KEY
```

### `Cannot find module '@ajmal_n/lumen-core'`

Run `npm install` at the repo root — workspace symlinks only exist after install.

### TypeScript errors after editing `core/src/*`

CLI and desktop import `core/dist/`, not source. Rebuild:

```bash
npm run build:core
```

### Desktop: blank window

Open devtools (`Ctrl+Shift+I`) and check the console. Usually a stale build — run `npm run build` and relaunch.

### `electron-builder` fails on Windows with symlink errors

Build inside WSL2, or run from an elevated (Administrator) terminal.
