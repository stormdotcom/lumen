# @ajmal_n/lumen-cli

The Lumen command-line interface. Published to npm as **`@ajmal_n/lumen-cli`** and
installs the **`lumen`** binary.

Lumen scans any repository, emits a self-contained **HTML** or **Markdown**
report, and — when it finds a coverage directory — folds in a **test-coverage
breakdown** that works across Jest, Vitest, Nx, Jasmine, Karma, Mocha (nyc),
AVA, tap, or anything else that writes Istanbul `coverage-summary.json` /
`lcov.info`.

## Install

```bash
npm install -g @ajmal_n/lumen-cli
```

Or run on demand without installing:

```bash
npx @ajmal_n/lumen-cli .
```

## Usage

```bash
lumen [path] [options]
```

### Interactive mode

Run `lumen` with no arguments from any directory and you get a persistent guided
menu (it returns to the menu after every action — only **Exit** quits):

```bash
lumen
```

The menu lets you:

1. Pick the repo path (defaults to the current directory).
2. Set a **test command** to run inside that repo (defaults to `npm test`
   if a `test` script exists in `package.json`). Leave blank to skip.
3. Pick what to do:

| Option | What it does |
| --- | --- |
| **Coverage check · changed files (diff)** | Git diff vs base branch → shows coverage only for files you touched. Fast. |
| **Coverage check · all files** | Run tests, stream output, show full coverage summary in terminal. |
| **Run tests · generate HTML report** | Run tests + write a full HTML report to `~/Downloads`. |
| **Run tests · generate Markdown report** | Same, but Markdown — also prints to terminal so you can pipe it. |
| **Scan only** | Skip the test run; parse whatever coverage data is already on disk. |
| **AI analysis** | Ask Ollama / OpenAI / Anthropic for a summary + three prioritized suggestions. |
| **Change repository path** | Switch repos without restarting. |
| **Change test command** | Update the command inline. |
| **Exit** | Quit. |

Press **Ctrl+C** at any prompt to exit cleanly. The menu only appears in
interactive terminals — piped or CI invocations fall through to the flag-driven
mode below.

---

### Diff coverage (default, fast)

The **"Coverage check · changed files"** menu option and the `--diff` CLI flag
compare your current branch against the base branch and show coverage only for
the files you changed — so you know immediately whether your new code is covered.

```
Branch : feature/new-parser  →  origin/main
Changed: 3 files
Coverage data for 3 of 3 changed files
────────────────────────────────────────────────────────────
src/parser.ts      ████████░░   82.0%  ⚠
src/scanner.ts     ██████████  100.0%  ✓
src/util.ts        ██████░░░░   62.0%  ✗
────────────────────────────────────────────────────────────
Total (changed files)          ████████░░   81.3%  ✓
  lines: 146/180  stmts: 146/180  fns: 22/24  branches: 31/44

✓ Passes 80% threshold
```

Base branch is auto-detected (`origin/main` → `origin/master` → `main` → `master`).
You can override it:

```bash
# Auto-detect base branch
lumen . --diff

# Explicit base
lumen . --diff origin/develop

# Full-project coverage instead
lumen . --all
lumen . --all -t 80          # + threshold gate
```

Bars use `█` / `░`; status uses `✓` (≥ threshold) / `⚠` (≥ 75% of threshold) / `✗` (below).

---

### AI analysis

Lumen can ask an LLM for a plain-language summary and three prioritized
suggestions, then bake the result into the HTML / Markdown report. It supports
three providers — the menu only shows ones it can reach:

| Provider | How to enable |
| --- | --- |
| **Ollama** (local, free) | `ollama serve` + `ollama pull llama3.2` |
| **OpenAI** | `export OPENAI_API_KEY=sk-…` |
| **Anthropic** | `export ANTHROPIC_API_KEY=sk-ant-…` |

Lumen sends only coverage metrics and the names of the worst-covered files — no
source code is uploaded.

Override endpoints / models via env:

| Env | Default |
| --- | --- |
| `LUMEN_OLLAMA_URL` | `http://localhost:11434` |
| `LUMEN_OLLAMA_MODEL` | first installed `llama3.x` / `qwen2.5` / `mistral` |
| `OPENAI_BASE_URL` | `https://api.openai.com` |
| `LUMEN_OPENAI_MODEL` | `gpt-4o-mini` |
| `ANTHROPIC_BASE_URL` | `https://api.anthropic.com` |
| `LUMEN_ANTHROPIC_MODEL` | `claude-haiku-4-5-20251001` |

---

### Options

| Flag | Description | Default |
| --- | --- | --- |
| `-f, --format <fmt>` | Output format — `html` or `markdown` (alias: `md`) | `html` |
| `-o, --out <dir>` | Output directory for the report | `~/Downloads` |
| `-n, --name <name>` | Override the report filename (no extension) | timestamped |
| `--diff [base]` | Show coverage for changed files only (git diff vs base branch) | off |
| `--all` | Check full-project coverage — overrides `--diff` | off |
| `--coverage-dir <dir>` | Path to coverage output dir. Auto-discovered if omitted. | auto |
| `--no-coverage` | Skip test-coverage detection entirely | off |
| `-t, --threshold <pct>` | Fail with exit code `2` if line coverage is below this percent | none |
| `--print-path` | Print only the path to the generated report (machine-readable) | off |
| `-V, --version` | Print version | |
| `-h, --help` | Print help | |

---

### Test coverage

Lumen auto-detects your testing framework from `package.json` / config files
and walks the repo for any `coverage/coverage-summary.json` (Istanbul) or
`lcov.info` file — including Nx-style nested layouts like
`coverage/apps/<name>/coverage-summary.json`.

Run your tests with coverage enabled **before** running `lumen`:

```bash
# Jest
npx jest --coverage

# Vitest
npx vitest run --coverage

# Nx (jest under the hood)
npx nx test myapp --coverage

# Mocha + nyc
npx nyc --reporter=json-summary --reporter=lcov mocha
```

Then run Lumen:

```bash
# Interactive menu — diff coverage is the first option in git repos
lumen

# CLI — diff mode (fast, changed files only)
lumen . --diff

# CLI — full project with threshold gate (CI-friendly)
lumen . --all -t 80

# Generate a full HTML report
lumen . -f html -o ./reports
```

---

### Examples

```bash
# Interactive menu (recommended)
lumen

# Diff coverage — check only what you changed, exit 2 if below 80%
lumen . --diff -t 80

# Diff against a specific branch
lumen . --diff origin/develop -t 80

# Full project coverage in CI
lumen . --all -t 80 --no-coverage=false

# HTML report with AI summary (needs OPENAI_API_KEY or ANTHROPIC_API_KEY)
lumen . -f html -o ~/reports

# Markdown report — output goes to terminal + file
lumen . -f md

# Scan only (no tests), Markdown, custom location
lumen . -f md -o . -n REPORT

# Point at a non-standard coverage location
lumen . --diff --coverage-dir ./apps/web/coverage

# Skip coverage detection entirely
lumen . --no-coverage

# Pipe the report path to another tool
xdg-open "$(lumen . --print-path)"
```

---

## Develop

This package lives in the [Lumen monorepo](../). From the repo root:

```bash
npm install
npm run -w @ajmal_n/lumen-core build
npm run -w @ajmal_n/lumen-cli build
node cli/dist/index.js .
```

Run tests on the core package:

```bash
npm run -w @ajmal_n/lumen-core test
npm run -w @ajmal_n/lumen-core test:coverage
```

## Publishing

See [PUBLISHING.md](../PUBLISHING.md) at the repo root.
