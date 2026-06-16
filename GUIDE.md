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

You point Lumen at a repository (any folder, really) and it produces a single
HTML file summarizing what's in there:

- Total files, size, and lines of code
- Per-extension rollup (`.ts`, `.py`, `.css`, …) with size + LOC bars
- Top-level directory breakdown
- The 15 largest files
- Detected "notable" files — `README`, `LICENSE`, `package.json`,
  `Dockerfile`, etc.
- A collapsible file tree

The report is **one self-contained HTML file** — no external CSS, no JS, no
network calls. Open it in a browser, email it, drop it in a wiki — it just
works.

Lumen ignores `node_modules`, `.git`, `dist`, `build`, `coverage`, `.next`,
`__pycache__`, virtual envs, and similar build/dependency folders by default.

## Install the CLI

The fastest way:

```bash
npm install -g @ajmal_n/lumen-cli
```

Or run without installing:

```bash
npx @ajmal_n/lumen-cli .
```

Requires Node.js **18 or newer**.

## Using the CLI

```bash
lumen [path] [options]
```

`path` defaults to the current directory.

### Options

| Flag | Description | Default |
| --- | --- | --- |
| `-f, --format <fmt>` | Output format — `html` or `markdown` (alias: `md`) | `html` |
| `-o, --out <dir>` | Output directory for the report | `~/Downloads` |
| `-n, --name <name>` | Override the report filename (no extension) | `lumen-<repo>-<timestamp>` |
| `--coverage-dir <dir>` | Path to coverage output dir (e.g. `./coverage`). Auto-discovered if omitted. | auto |
| `--no-coverage` | Skip test-coverage detection entirely | off |
| `-t, --threshold <pct>` | Fail with exit code `2` if total line coverage < pct | none |
| `--print-path` | Print only the report path (machine-readable) | off |
| `-V, --version` | Print the version | |
| `-h, --help` | Print help | |

The file extension is chosen automatically based on `--format` (`.html` or
`.md`), so you don't put it in `--name`.

### Examples

```bash
# Scan current directory → HTML report into ~/Downloads
lumen .

# Markdown report instead — perfect for pasting into a README or wiki
lumen . --format markdown
lumen . -f md            # same thing, short alias

# Scan a project, save the report next to it
lumen ~/code/myapp --out ~/code/myapp

# Custom filename
lumen . --name today-snapshot

# Markdown straight into the current dir
lumen . -f md -o . -n REPORT     # → ./REPORT.md

# Open the report immediately (Linux/macOS)
xdg-open "$(lumen . --print-path)" 2>/dev/null || open "$(lumen . --print-path)"
```

### Output formats

- **HTML** (default) — a single self-contained document with inline CSS,
  styled like the desktop GUI. Open in a browser, email, or upload anywhere.
- **Markdown** — renders the same data as GitHub-flavored Markdown tables
  with collapsible "ignored directories" details. Pastes cleanly into
  GitHub issues, READMEs, Notion, and most wikis.

### Test coverage

Lumen detects your testing framework (Jest, Vitest, Nx, Jasmine, Karma,
Mocha+nyc, AVA, tap) from `package.json` + config files, then scans for
Istanbul `coverage-summary.json` and `lcov.info` files anywhere in the repo —
including Nx-style nested layouts (`coverage/apps/<name>/coverage-summary.json`).

Run your tests with coverage enabled first:

```bash
# Jest
npx jest --coverage --coverageReporters=json-summary --coverageReporters=lcov

# Vitest
npx vitest run --coverage --coverage.reporter=json-summary --coverage.reporter=lcov

# Nx (jest under the hood)
npx nx test myapp --coverage --coverageReporters=json-summary

# Mocha + nyc
npx nyc --reporter=json-summary --reporter=lcov mocha
```

Then run Lumen. Coverage cards (Lines / Statements / Functions / Branches),
the worst-covered files, and a threshold pill all show up automatically.

```bash
lumen . -f md -o . -n COVERAGE -t 80      # CI gate at 80% line coverage
lumen . --coverage-dir ./apps/web/coverage
lumen . --no-coverage                     # skip detection
```

### Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Report written |
| 1 | Path doesn't exist or isn't a directory, or bad flag |
| 2 | Coverage below `--threshold` |

## Install the Desktop app

Grab the latest installer from the
[Releases page](../../releases):

- **Windows** — `Lumen-Setup-<version>.exe` (NSIS installer) or `Lumen-<version>.exe` (portable, no install)
- **Linux** — `Lumen-<version>.AppImage` (chmod +x and run) or `lumen-desktop_<version>_amd64.deb`

macOS is unsupported as a maintained target, but a `dist:mac` build with
electron-builder will work if you compile from source.

## Using the Desktop app

1. Launch **Lumen**.
2. Click **Open Repository…** in the top right.
3. Pick the folder you want to scan.
4. The report appears in the app — same content as the CLI's HTML, rendered
   inside an Electron window.
5. Click **Export HTML** to save the same report as a standalone `.html` file.
   The file picker opens in your `Downloads` folder by default.

The desktop's "Export HTML" output is byte-for-byte identical to what the CLI
would have produced for the same folder.

## What's in a report

A Lumen report has four sections:

### 1. Stats cards
Big-number summary: total files, total size, lines of code, number of ignored
paths.

### 2. File tree
A collapsible tree of the 15 largest files (anchored to their directories).
This makes it easy to spot a single oversized file buried deep in the tree.

### 3. Notable files
Standard project files that were detected — `README.md`, `LICENSE`,
`package.json`, `Dockerfile`, `Cargo.toml`, `go.mod`, etc.

### 4. Breakdown tables
- **File Types** — top 20 extensions by file count, with a bar chart, total
  size, and total lines.
- **Top Directories** — file count and size per top-level directory.
- **Largest Files** — the 15 biggest files, with a size bar weighted across the
  whole project.

## Repo layout

```
lumen/
├── core/                @ajmal_n/lumen-core — shared scanner + renderers + coverage
│   ├── src/
│   │   ├── scanner.ts   walks the tree, builds RepoStats
│   │   ├── report.ts    RepoStats (+ CoverageReport) → single HTML doc
│   │   ├── markdown.ts  RepoStats (+ CoverageReport) → GFM markdown
│   │   ├── coverage.ts  framework detection + Istanbul/lcov parser
│   │   └── index.ts     re-exports
│   ├── package.json
│   └── tsconfig.json
│
├── cli/                 @ajmal_n/lumen-cli — npm package + `lumen` binary
│   ├── src/index.ts     CLI entry (uses commander)
│   ├── package.json
│   └── tsconfig.json
│
├── desktop/             lumen-desktop — Electron GUI
│   ├── src/
│   │   ├── main.ts          Electron main process
│   │   ├── preload.ts       contextBridge → window.lumen
│   │   └── renderer/
│   │       ├── index.html   Shell UI
│   │       ├── app.ts       Renderer logic
│   │       └── styles.css   Light theme
│   ├── scripts/copy-assets.js
│   ├── package.json         (includes electron-builder config)
│   ├── tsconfig.json        main + preload
│   └── tsconfig.renderer.json
│
├── .github/workflows/   ci.yml + release.yml
├── package.json         npm workspaces root
├── tsconfig.base.json   shared TS settings
├── README.md            brief overview
├── GUIDE.md             this file
├── CONTRIBUTING.md      how to send patches
├── LICENSE              MIT
└── .editorconfig
```

## Building from source

Requirements: Node.js **18 or newer**, npm **9 or newer**.

### Step 1 — Clone

```bash
git clone https://github.com/<you>/lumen.git
cd lumen
```

### Step 2 — Install dependencies (once)

```bash
npm install
```

`npm install` at the root does the work for **every** workspace in one shot.
You should see something like `added N packages, audited N+ in workspaces`.

This creates:
- `node_modules/` at the root (shared deps hoisted here)
- `node_modules/@ajmal_n/lumen-core` — a **symlink** into `core/`, so the CLI and
  desktop app import the live source you're editing, no rebuild dance.
- `cli/node_modules/`, `desktop/node_modules/` — only package-specific deps
  that can't hoist.

If you ever see `Cannot find module '@ajmal_n/lumen-core'`, you skipped this step or
the symlink was clobbered. Run `npm install` again.

### Step 3 — Build everything

```bash
npm run build
```

Compiles in order: `core` → `cli` → `desktop` (renderer + main + preload +
asset copy). The order matters because the latter two import the JS that
`core`'s build emits.

You can also build a single package:

```bash
npm run build:core
npm run build:cli
npm run build:desktop
```

### Step 4 — Run it

CLI on the current folder:

```bash
node cli/dist/index.js .
```

Or use the root shortcut:

```bash
npm run cli -- .
```

Desktop app:

```bash
npm run desktop
```

### Step 5 (optional) — Install the CLI globally from your local clone

If you want to type `lumen` anywhere on your machine and have it run *your*
local code, link it:

```bash
npm install -g ./cli
# or:
cd cli && npm link
```

Now `lumen .` from any directory invokes the binary built in `cli/dist/`.
To undo:

```bash
npm uninstall -g @ajmal_n/lumen-cli
```

### Step 6 — Iterate

A typical edit-build-run loop:

```bash
# edit a file under core/src/ or cli/src/
npm run build:core   # if you touched core
npm run build:cli    # if you touched cli
node cli/dist/index.js .
```

For the desktop app, `npm run -w lumen-desktop dev` rebuilds and re-launches
Electron in one command.

### Cleaning up

```bash
npm run clean             # wipes every dist/
rm -rf node_modules core/node_modules cli/node_modules desktop/node_modules
rm package-lock.json      # only if you want a fully fresh resolve
npm install               # start over
```

### Build a single package

```bash
npm run build:core
npm run build:cli
npm run build:desktop
```

### Clean

```bash
npm run clean
```

Wipes every `dist/` folder.

## Building the desktop app

Binaries are produced by [electron-builder](https://www.electron.build/), with
config baked into `desktop/package.json`. Output goes to `desktop/release/`.

```bash
# From the repo root:
npm run -w lumen-desktop dist:win     # Windows: NSIS installer + portable .exe
npm run -w lumen-desktop dist:linux   # Linux: AppImage + .deb
npm run -w lumen-desktop dist:all     # Both
```

### Cross-compiling

- **Windows ↔ Linux** generally works on either host.
- For **Linux from Windows**, you may need WSL2 with the standard Electron
  build deps installed.
- For **macOS**, build on macOS — code signing for `.dmg` requires it.

### Adjusting the build

Edit the `build` block in `desktop/package.json`:

```jsonc
"build": {
  "appId": "io.lumen.desktop",
  "productName": "Lumen",
  "directories": { "output": "release" },
  "files": ["dist/**/*", "package.json"],
  "win":   { "target": ["nsis", "portable"] },
  "linux": { "target": ["AppImage", "deb"], "category": "Development" }
}
```

Add an icon by setting `build.win.icon` (`.ico`) and `build.linux.icon`
(`.png`, 512×512 or larger).

## Customizing the report

All visual changes live in **one file**: `core/src/report.ts`. The CSS is
inlined in the returned HTML string. Both the CLI and the desktop's "Export
HTML" action call the same `renderReport(stats)` function, so anything you
change here applies everywhere.

For the in-app desktop view (which renders the same data but with interactive
buttons), edit `desktop/src/renderer/app.ts` and `desktop/src/renderer/styles.css`.

### Adjusting what gets scanned

Edit `core/src/scanner.ts`:

- `DEFAULT_IGNORE` — directory names that are skipped entirely.
- `TEXT_EXTENSIONS` — extensions that get a line count (binary files are
  counted but their LOC is reported as 0).
- `NOTABLE_NAMES` — files surfaced in the "Notable files" section.

Then rebuild:

```bash
npm run build:core
npm run build:cli    # or build:desktop
```

## Architecture

### The flow

```
                ┌─────────────────────────┐
                │      @ajmal_n/lumen-core        │
                │                         │
                │   scanRepo(path)        │
                │       └─► RepoStats     │
                │                         │
                │   renderReport(stats)   │
                │       └─► HTML string   │
                └────────────┬────────────┘
                             │
        ┌────────────────────┴────────────────────┐
        │                                         │
        ▼                                         ▼
┌─────────────────┐                  ┌──────────────────────────┐
│   @ajmal_n/lumen-cli     │                  │     lumen-desktop        │
│                 │                  │                          │
│ argv ─► scan    │                  │  main.ts                 │
│      ─► render  │                  │   ├─ pickDirectory       │
│      ─► fs.write│                  │   ├─ scanRepo (IPC)      │
└─────────────────┘                  │   └─ exportReport (IPC)  │
                                     │                          │
                                     │  preload.ts              │
                                     │   └─ contextBridge       │
                                     │                          │
                                     │  renderer/app.ts         │
                                     │   ├─ pickDirectory       │
                                     │   ├─ scan & render UI    │
                                     │   └─ Export → renderReport│
                                     └──────────────────────────┘
```

### Why a monorepo?

The shared `@ajmal_n/lumen-core` package lets the CLI and the desktop GUI produce
identical reports without duplicating scanner or template code. Workspace
linking via npm means changes to `core/src/*.ts` are picked up by the other
packages on the next `npm run build`.

### Desktop security model

The renderer runs with:
- `contextIsolation: true`
- `nodeIntegration: false`

It can only call the API exposed by `preload.ts` (`window.lumen.*`). The
preload uses `contextBridge.exposeInMainWorld` so the renderer never touches
Electron or Node APIs directly.

The HTML has a strict Content Security Policy that blocks remote scripts and
remote stylesheets.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the short version. The 30-second
checklist:

```bash
git clone https://github.com/<you>/lumen.git
cd lumen
npm install
npm run build          # must pass
# make your change
node cli/dist/index.js .   # sanity check
git checkout -b feat/<thing>
git commit -am "feat: <thing>"
# open a PR
```

### Code style

- TypeScript strict mode is on. Leave it on.
- No frameworks in the renderer. Plain DOM + ES modules.
- Prefer editing existing files over creating new ones.
- Run `npm run build` before opening a PR — that's the entire test suite right
  now.

## Releasing

For the npm publish workflow, see the local `PUBLISHING.md` (gitignored). The
short version:

1. Bump the version in `core/package.json` (if `core` changed) and
   `cli/package.json`.
2. Tag the commit: `git tag v0.x.y && git push --follow-tags`.
3. The `Release` workflow in `.github/workflows/release.yml` publishes
   `@ajmal_n/lumen-core` and `@ajmal_n/lumen-cli` to npm, and builds desktop binaries for
   Windows and Linux as workflow artifacts.

You need an `NPM_TOKEN` repository secret. Create it with:

```bash
npm token create --read-only=false
```

Then add it under **Settings → Secrets and variables → Actions** on GitHub.

## Troubleshooting

### `lumen: command not found` after `npm install -g @ajmal_n/lumen-cli`

Your npm global bin directory isn't on `PATH`. Find it:

```bash
npm config get prefix
```

Add `<prefix>/bin` (Linux/macOS) or `<prefix>` (Windows) to your `PATH`.

### `cannot resolve @ajmal_n/lumen-core` after a fresh clone

You skipped `npm install` at the repo root. Run it — workspace symlinks only
exist after install.

### TypeScript errors after editing `core/src/*`

`cli` and `desktop` consume `core/dist/`, not its source. Rebuild core:

```bash
npm run build:core
```

### `electron-builder` complains about symlinks on Windows

Some Windows configurations refuse to follow workspace symlinks. Workarounds:

- Build inside WSL2.
- Or run `npm run build` then `npm run -w lumen-desktop dist:win` from an
  elevated terminal.

### The report is empty or missing files

Lumen ignores `node_modules`, `.git`, `dist`, `build`, `coverage`, etc. by
default. If your repo's source lives under one of those names (e.g. you have
a folder literally called `build`), edit `DEFAULT_IGNORE` in
`core/src/scanner.ts` and rebuild.

### Desktop app shows a blank window

Check the Electron devtools console (`Ctrl+Shift+I`). The most common cause is
a stale build — run `npm run build` from the repo root and relaunch.

### "I want the dark theme back"

The original dark theme is in git history (commit before the screenshot-driven
redesign). You can either:

1. Add a CSS variable toggle in `core/src/report.ts` and a `--theme dark` CLI
   flag, or
2. Swap the `:root` block in `report.ts` for the dark palette.

PRs welcome.
