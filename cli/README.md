# @ajmal_n/lumen-cli

> Repository insight and test-coverage analysis — from any terminal, in seconds.

Lumen scans any repository and gives you a rich, interactive report covering file structure, language breakdown, code size — and a full **test-coverage analysis** with diff-aware checking, AI summaries, and a CI threshold gate.

```bash
npm install -g @ajmal_n/lumen-cli
lumen
```

> **0.9.1 — coverage accuracy update**
> - Headline % now follows **industry-standard aggregation**: zero-denominator metrics (e.g. a file with 0 branches) are treated as **N/A** and excluded from the aggregate instead of inflating it to 100%.
> - All percentages report with **2-decimal precision** (`82.00%`, not `82.0%`).
> - New **Untested source files** sidecar: lists source files that have **no coverage data at all** (JS/TS, Python, Go, Rust, Java, Kotlin). It's reported separately so the headline % stays apples-to-apples with what your test runner instrumented.

---

## Table of contents

1. [Install](#install)
2. [Quick start](#quick-start)
3. [Interactive menu](#interactive-menu)
4. [Diff coverage](#diff-coverage-default-in-git-repos)
5. [Running tests](#running-tests)
6. [AI analysis](#ai-analysis)
7. [Generating reports](#generating-reports)
8. [CLI flag reference](#cli-flag-reference)
9. [Test framework setup](#test-framework-setup)
10. [CI integration](#ci-integration)
11. [MCP server (Claude Desktop / Cursor / Claude Code)](#mcp-server)
12. [Git hooks](#git-hooks)
13. [Environment variables](#environment-variables)
13. [Exit codes](#exit-codes)
14. [Troubleshooting](#troubleshooting)

---

## Install

```bash
# Global install — gives you the `lumen` command everywhere
npm install -g @ajmal_n/lumen-cli

# Or run without installing
npx @ajmal_n/lumen-cli .
```

Requires **Node.js 18 or newer**.

---

## Quick start

```bash
# Interactive menu (recommended)
lumen

# One-shot HTML report into ~/Downloads
lumen .

# Markdown report
lumen . -f md

# Check coverage for changed files only (git diff vs main)
lumen . --diff

# Full-project coverage with a CI threshold gate
lumen . --all -t 80
```

---

## Interactive menu

Run `lumen` with no arguments from any terminal. The menu is **persistent** — it returns to the main menu after every action. Only selecting **Exit** (or pressing `Ctrl+C`) quits.

```
◆  lumen · interactive mode
│
◆  Repository path
│  /home/you/projects/myapp
│
◆  Test command (leave blank to skip running tests)
│  npm test
│
◆  What would you like to do?
│  ● Coverage check · changed files (diff vs base branch)   fast · shows only files you changed
│  ○ Coverage check · all files (full project)
│  ○ Run tests · generate HTML report
│  ○ Run tests · generate Markdown report
│  ○ Scan only (skip running tests)
│  ○ AI analysis · summary + suggestions                    OpenAI, Anthropic
│  ○ Change repository path                                 /home/you/projects/myapp
│  ○ Change test command                                    npm test
│  ○ Exit
```

### Menu options

| Option | What it does |
|---|---|
| **Coverage check · changed files (diff)** | Git diff vs base branch → coverage only for files you touched. Fast. Falls back to full if no git / no changed files. |
| **Coverage check · all files** | Runs your test command, streams output live, shows a full coverage summary when done. |
| **Run tests · generate HTML report** | Runs tests + writes a standalone HTML report to `~/Downloads`. |
| **Run tests · generate Markdown report** | Same as HTML, but Markdown — also prints it to the terminal so you can pipe or copy it. |
| **Scan only** | No test run — scans the repo and parses whatever coverage data is already on disk. |
| **AI analysis** | Asks an LLM for a plain-language summary and three concrete suggestions. |
| **Change repository path** | Switch to a different repo without restarting. |
| **Change test command** | Update the command inline. |
| **Exit** | Quit. |

> **Tip:** The diff coverage option is shown only when the directory is a git repository. In non-git repos, the menu shows full-project coverage instead.

---

## Diff coverage (default in git repos)

The killer feature. Instead of checking the entire project, Lumen compares your current branch against the base branch and shows coverage **only for the files you changed**.

```
Branch : feature/parser-rewrite  →  origin/main
Changed: 4 files
Coverage data for 4 of 4 changed files
────────────────────────────────────────────────────────────
src/parser/index.ts       ████████░░   82.00%  ⚠
src/parser/tokenizer.ts   ██████████  100.00%  ✓
src/util/string.ts        ██████░░░░   60.00%  ✗
src/util/array.ts         █████████░   90.00%  ✓
────────────────────────────────────────────────────────────
Total (changed files)     ████████░░   82.78%  ✓
  lines: 149/180  stmts: 149/180  fns: 18/22  branches: 33/44

✓ Passes 80% threshold
```

### How it works

1. Runs `git merge-base HEAD <base>` then `git diff --name-only` to find changed files.
2. Reads coverage data already on disk — no re-running tests.
3. Filters `coverage-summary.json` / `lcov.info` to only the changed files.
4. Shows the result in ~1 second.

### Failover chain

Diff mode degrades gracefully at every step:

| Situation | What happens |
|---|---|
| Not a git repository | Warning printed → full-project coverage shown |
| `git` commands fail | Warning printed → full-project coverage shown |
| No changed files detected | Warning printed → full-project coverage shown |
| Changed files found but none in coverage data | Warning + changed files listed → full-project coverage shown |

### CLI usage

```bash
# Auto-detect base branch (tries origin/main → origin/master → main → master)
lumen . --diff

# Explicit base branch
lumen . --diff origin/develop

# Diff with threshold gate
lumen . --diff -t 80

# Full-project coverage (override diff)
lumen . --all
lumen . --all -t 80
```

### Status indicators

| Symbol | Meaning |
|---|---|
| `✓` | Coverage at or above threshold (default 80%) |
| `⚠` | Coverage between 75% and 100% of threshold |
| `✗` | Coverage below 75% of threshold |

---

## Running tests

The interactive menu runs your test command and streams output live to the terminal. You can watch it line-by-line.

**Common test commands:**

```bash
npm test
jest --coverage
vitest run --coverage
npx jest --coverage --coverageReporters=json-summary
npx vitest run --coverage --coverage.reporter=json-summary
```

Lumen auto-detects the default from `scripts.test` in your `package.json`. You can override it at any prompt.

**After tests finish**, Lumen:
1. Parses the coverage data that the test runner just wrote.
2. Shows the summary in the terminal, or writes it to an HTML / Markdown file.
3. If diff mode was active, filters to changed files.

---

## AI analysis

Lumen can ask an LLM for a one-paragraph summary of your test health and three concrete, prioritized suggestions. The result is shown in the terminal and can be embedded in the HTML / Markdown report.

### Supported providers

| Provider | How to enable |
|---|---|
| **Ollama** (local, free, private) | `ollama serve` + `ollama pull llama3.2` |
| **OpenAI** | `export OPENAI_API_KEY=sk-…` |
| **Anthropic** | `export ANTHROPIC_API_KEY=sk-ant-…` |

The menu shows only providers that are currently reachable. If none are configured, the AI option is shown but disabled with setup hints.

### What gets sent to the AI

Only **metrics** — no source code is uploaded:
- Repository name and file count
- Framework name
- Total coverage percentages
- Names of the 5 worst-covered files (not their content)
- Last 8 lines of test output (to detect failure patterns)

### Example output

```
AI Analysis · OpenAI · gpt-4o-mini

The parser module has strong coverage on happy paths (tokenizer.ts at 100%)
but the new string utility functions added in this branch are largely untested
at 60% line coverage. Branches in the error-handling paths of array.ts are
the most critical gap.

Suggestions:
1. Add unit tests for the edge cases in util/string.ts — particularly the
   Unicode normalization paths (lines 45-72).
2. Write a negative test for the parser when input is null or undefined.
3. Consider adding a coverage threshold check to CI at 80% to catch regressions.
```

### Teaching the AI about your repo

Drop short markdown notes into `.lumen/rules/` at the repo root and they'll be injected into every AI prompt as repository conventions. Keeps the AI from suggesting things you've already decided against.

```
.lumen/rules/
├── INSTRUCTIONS.md   # read first
├── design.md
└── style.md
```

```markdown
<!-- INSTRUCTIONS.md -->
- Branches above 70% in `src/utils/` are acceptable.
- `src/legacy/` is intentionally untested — do not suggest tests there.
- Prefer table-driven tests over per-case `it` blocks.
```

`INSTRUCTIONS.md` is loaded first; the rest are appended alphabetically. The whole bundle is capped at **3000 characters** — short, high-signal rules outperform long manuals.

---

## Generating reports

### HTML report

Self-contained single file — no external CSS, no JavaScript, no network calls. Open in any browser, email, upload anywhere.

```bash
lumen . -f html -o ~/Desktop --name my-report
# → ~/Desktop/my-report.html
```

### Markdown report

GitHub-flavored Markdown with tables, badges, and a collapsible section for ignored directories.

```bash
lumen . -f md -o . -n COVERAGE
# → ./COVERAGE.md
```

When choosing **Markdown** in the interactive menu, the content is also printed to the terminal so you can pipe it:

```bash
lumen . -f md | grep "Lines"
```

### What's in the report

| Section | Contents |
|---|---|
| **Summary** | Total files, total size, LOC, ignored dirs |
| **Notable files** | README, LICENSE, package.json, Dockerfile, etc. |
| **File types** | Top 20 extensions with file count, size, and LOC |
| **Top directories** | File count and size per top-level dir |
| **Largest files** | The 15 biggest files |
| **Test coverage** | Lines / Statements / Functions / Branches cards + per-file table (2-decimal precision, industry-standard aggregation) |
| **Untested source files** | Sidecar list of source files with **no coverage data at all** — JS/TS, Python, Go, Rust, Java, Kotlin |
| **AI Analysis** | Plain-language summary + suggestions (if requested) |

---

## CLI flag reference

```bash
lumen [path] [options]
```

`path` defaults to the current directory.

| Flag | Description | Default |
|---|---|---|
| `-f, --format <fmt>` | Output format: `html`, `markdown` / `md`, or `json` | `html` |
| `-o, --out <dir>` | Output directory | `~/Downloads` |
| `-n, --name <name>` | Report filename without extension | `lumen-<repo>-<timestamp>` |
| `--diff [base]` | Diff coverage: show only changed files vs base branch | off |
| `--all` | Full-project coverage — overrides `--diff` | off |
| `--coverage-dir <dir>` | Path to coverage directory (auto-discovered if omitted) | auto |
| `--no-coverage` | Skip coverage detection | off |
| `-t, --threshold <pct>` | Exit code `2` if line coverage is below this percent | none |
| `--fail-on-decrease` | Exit `2` if any metric dropped since last snapshot (`.lumen/snapshot.json`) | off |
| `--show-uncovered` | Print uncovered line ranges per file (requires `lcov.info`) | off |
| `--json` | Print coverage + repo data as JSON to stdout | off |
| `--open` | Open the generated report in the default OS viewer | off |
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

# Open the report in your browser automatically
lumen . --open

# Markdown
lumen . -f md
lumen . -f md -o . -n COVERAGE   # → ./COVERAGE.md

# JSON — machine-readable, pipe to jq
lumen . --json | jq '.coverage.total.lines.pct'
lumen . -f json -o .            # → ./lumen-<repo>-<ts>.json (file)

# Show uncovered line ranges (requires lcov.info)
lumen . --show-uncovered

# Enforce no regressions — exit 2 if coverage dropped since last run
lumen . --fail-on-decrease

# CI: generate report + gate on coverage
lumen . --all -f md -o . -n COVERAGE -t 80

# Skip coverage entirely
lumen . --no-coverage

# Custom coverage directory
lumen . --coverage-dir ./apps/web/coverage
```

---

## Test framework setup

Lumen reads coverage data from **existing files on disk**. Run your tests with coverage enabled before running `lumen`.

### Jest

```bash
# Minimal — json-summary is all Lumen needs
npx jest --coverage --coverageReporters=json-summary

# Also generate lcov for industry-standard coverage reporting tools
npx jest --coverage --coverageReporters=json-summary --coverageReporters=lcov
```

Or in `jest.config.js`:

```js
module.exports = {
  coverageReporters: ["json-summary", "lcov", "text"],
};
```

### Vitest

```bash
npx vitest run --coverage --coverage.reporter=json-summary
```

Or in `vitest.config.ts`:

```ts
export default {
  test: {
    coverage: {
      reporter: ["json-summary", "lcov", "text"],
    },
  },
};
```

### Nx

```bash
npx nx test myapp --coverage --coverageReporters=json-summary
```

### Mocha + nyc

```bash
npx nyc --reporter=json-summary --reporter=lcov mocha
```

Or in `.nycrc`:

```json
{
  "reporter": ["json-summary", "lcov", "text"]
}
```

### Jasmine + nyc

```bash
npx nyc --reporter=json-summary jasmine
```

---

## CI integration

### GitHub Actions — diff coverage on PRs

```yaml
name: Coverage check

on: [pull_request]

jobs:
  coverage:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0          # needed for git diff

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - run: npm ci
      - run: npm test             # must generate coverage-summary.json

      - name: Install lumen
        run: npm install -g @ajmal_n/lumen-cli

      - name: Diff coverage check
        run: lumen . --diff origin/${{ github.base_ref }} -t 80
        # exits 0 if changed-file coverage ≥ 80%, exits 2 if below
```

### Full-project coverage gate

```yaml
      - name: Full coverage check
        run: lumen . --all -t 80
```

### Generate a Markdown report as a PR comment

```yaml
      - name: Generate coverage report
        run: lumen . --all -f md -o . -n coverage-report --print-path

      - name: Comment on PR
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const body = fs.readFileSync('coverage-report.md', 'utf8');
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: body.slice(0, 65536),
            });
```

---

## MCP server

Lumen ships an [MCP](https://modelcontextprotocol.io) server so AI assistants (Claude Desktop, Cursor, Claude Code, etc.) can call Lumen directly — no API keys, no source-code uploads. Tool calls run locally over stdio.

### Start the server

```bash
lumen mcp serve              # speaks MCP over stdio — connect from your host app
lumen mcp config             # prints the JSON snippet to paste into your host config
lumen mcp tools              # prints the tool list (name + description)
```

The menu's **MCP · setup** entry walks you through the same options interactively.

### Tools exposed

| Tool | What it does |
|---|---|
| `scan_repo` | File-tree statistics (file counts, sizes, line counts, language breakdown). |
| `coverage_summary` | Aggregated coverage (lines/statements/functions/branches), auto-excluding test files. |
| `diff_coverage` | Coverage filtered to files changed vs. the base branch — for PR / CI workflows. |
| `untested_files` | Source files with no coverage data at all. |
| `detect_framework` | Reports jest / vitest / mocha / jasmine / karma / ava / tap / nx / unknown. |
| `render_report` | Writes a self-contained HTML or Markdown report to disk and returns the path. |

All tools take an optional `path` argument (defaults to the host's current working directory).

### Connect from Claude Desktop / Cursor

Run `lumen mcp config` and paste the output into your host's MCP config file:

- **Claude Desktop** — `%APPDATA%\Claude\claude_desktop_config.json` (Windows) or `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)
- **Cursor** — `~/.cursor/mcp.json`

```json
{
  "mcpServers": {
    "lumen": {
      "command": "lumen",
      "args": ["mcp", "serve"]
    }
  }
}
```

### Connect from Claude Code

```bash
claude mcp add lumen -- lumen mcp serve
```

Then ask: *"Use lumen to check coverage on the current branch"* and the assistant will call `diff_coverage` directly.

---

## Git hooks

Wire the diff-coverage gate into git so it runs automatically. The hook is **per-repo**, **opt-in**, and never touches your global git config — no conflict with Husky / pre-commit / lefthook.

### Install

```bash
lumen hooks install              # pre-push (default — recommended)
lumen hooks install --pre-commit # pre-commit instead
lumen hooks install --force      # overwrite a non-Lumen hook
```

The installed hook runs:

```sh
exec lumen . --diff -t "${LUMEN_THRESHOLD:-80}"
```

- **Why pre-push by default?** Coverage data is usually fresh from the last test run, and blocking a push is the same gate CI would enforce a minute later. Pre-commit forces every commit to re-trust coverage state.
- **Threshold:** comes from `lumen.config.json` (`threshold` field) at install time, or defaults to `80`. Override at run time without reinstalling by exporting `LUMEN_THRESHOLD=90`.
- **Foreign hooks are safe:** if a hook is already there and isn't Lumen's, install refuses unless you pass `--force`.

### Status

```bash
lumen hooks status
```

Reports the resolved hooks directory, the threshold (and whether it came from config or default), and the state of `pre-push` / `pre-commit`: `not installed`, `installed (ours)`, or `present (not ours)`.

### Uninstall

```bash
lumen hooks uninstall
```

Removes only hooks Lumen owns (identified by a marker comment in the hook script). Foreign hooks are left untouched.

### Disable for one commit

```bash
git commit --no-verify
git push --no-verify
```

### Menu shortcut

The interactive menu's **"Hooks · setup"** entry walks you through install / status / uninstall — same as the CLI commands above.

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `OPENAI_API_KEY` | — | OpenAI API key for AI analysis |
| `ANTHROPIC_API_KEY` | — | Anthropic API key for AI analysis |
| `LUMEN_OLLAMA_URL` | `http://localhost:11434` | Ollama server URL |
| `LUMEN_OLLAMA_MODEL` | auto | Override Ollama model selection |
| `OPENAI_BASE_URL` | `https://api.openai.com` | OpenAI-compatible API base URL |
| `LUMEN_OPENAI_MODEL` | `gpt-4o-mini` | Override OpenAI model |
| `ANTHROPIC_BASE_URL` | `https://api.anthropic.com` | Anthropic API base URL |
| `LUMEN_ANTHROPIC_MODEL` | `claude-haiku-4-5-20251001` | Override Anthropic model |

---

## Config file

Persist flags per-repo. Lumen searches for `lumen.config.json`, `.lumenrc` (JSON), or a `"lumen"` key in `package.json`, walking up from the scanned directory to the git root.

**`lumen.config.json`:**
```json
{
  "threshold": 80,
  "format": "html",
  "outputDir": "./reports",
  "baseBranch": "origin/main",
  "coverageExclude": ["src/legacy/**", "scripts/**"],
  "includeTests": false,
  "thresholds": {
    "src/legacy/**": 40,
    "src/generated/**": 0,
    "src/**": 80
  }
}
```

Or in `package.json`:
```json
{
  "lumen": {
    "threshold": 80
  }
}
```

**Flag precedence:** CLI flags always override config file values.

**`baseBranch`:** default git ref to diff against when `--diff` is used without an argument. If unset, Lumen auto-detects in this order: `origin/main` → `origin/master` → `main` → `master` → `HEAD~1`. You can also set this interactively via **Change base branch** in the menu.

**`coverageExclude`:** glob patterns (`*` = single segment, `**` = any path) excluded from the **headline coverage aggregation** on top of the automatic test-file exclusion. Use this to bring Lumen's number in line with what your code-quality dashboard reports (test runners often instrument files like `src/legacy/`, `scripts/`, or `*.config.ts` that quality tools exclude).

**`includeTests`:** set to `true` to include test/spec files in the headline aggregation. Off by default — matches what industry-standard reporting tools do.

**`thresholds`:** per-file coverage gates using glob patterns — first match wins. Violations cause exit `2`.

**Snapshot storage:** `--fail-on-decrease` saves `.lumen/snapshot.json` in the project root. Add `.lumen/` to `.gitignore` for local baselines, or commit it to enforce no-regression in CI.

---

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Success |
| `1` | Invalid path, bad flag, or unexpected error |
| `2` | Coverage is below `--threshold`, dropped with `--fail-on-decrease`, or violates a per-file threshold |

---

## Troubleshooting

### `lumen: command not found` after global install

Your npm global bin directory is not on `PATH`. Find it and add it:

```bash
npm config get prefix
# Linux/macOS: add <prefix>/bin to PATH
# Windows: add <prefix> to PATH (it's usually %APPDATA%\npm)
```

### No coverage data found

Lumen looks for `coverage/coverage-summary.json` (Istanbul) or `coverage/lcov.info`. Make sure you run your tests with the correct reporter **before** running `lumen`:

```bash
npm test          # run with coverage
lumen . --diff    # then run lumen
```

### Diff shows "no changed files"

Make sure you have commits on your branch compared to the base. If you're on `main` comparing against `origin/main`, there are no changes to diff. Switch to a feature branch first.

### AI analysis times out

For Ollama: make sure `ollama serve` is running and the model is pulled:

```bash
ollama serve
ollama pull llama3.2
```

For OpenAI / Anthropic: verify your API key is set:

```bash
echo $OPENAI_API_KEY
echo $ANTHROPIC_API_KEY
```

### Output truncated for large test suites

Lumen caps captured test output at **4 MB per stream**. The report will show `(output truncated)` if this limit is hit. Coverage data is still parsed and shown fully — only the raw terminal output is capped.

---

## License

MIT © [Ajmal Nasumudeen](https://github.com/ajmaln)
