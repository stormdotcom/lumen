# Lumen

> Repository insight and test-coverage analysis — from any terminal, in seconds.

Lumen scans a code repository and produces a clean report covering its file tree, sizes, line counts, languages — and a full **test-coverage analysis** with diff-aware checking, AI summaries, and a CI threshold gate.

It ships in two forms:

- **`@ajmal_n/lumen-cli`** — a Node.js CLI with an interactive menu and a `lumen` binary.
- **`lumen-desktop`** — a cross-platform Electron GUI for Windows and Linux.

## Install the CLI

```bash
npm install -g @ajmal_n/lumen-cli
lumen
```

Run `lumen` with no arguments to open the interactive menu. Or scan immediately:

```bash
lumen .                        # HTML report → ~/Downloads
lumen . --diff                 # coverage for changed files only (default in git repos)
lumen . --all -t 80            # full project, fail if line coverage < 80%
lumen . -f md -o . -n COVERAGE # Markdown report → ./COVERAGE.md
lumen . --json | jq '.coverage.total.lines.pct'  # machine-readable JSON to stdout
lumen . --show-uncovered       # print uncovered line ranges per file (requires lcov.info)
lumen . --fail-on-decrease     # exit 2 if any metric dropped since last snapshot
lumen . --open                 # open the report in your default browser after generating
```

Run without installing:

```bash
npx @ajmal_n/lumen-cli .
```

Requires **Node.js 18 or newer**.

## Interactive menu

```
◆  lumen · interactive mode
│
◆  Repository path
│  /home/you/projects/myapp
│
◆  Test command
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

The menu is **persistent** — it returns after every action. Press `Ctrl+C` or choose **Exit** to quit.

## Diff coverage

The default in git repos. Compares your branch against the base and shows coverage **only for files you changed**:

```
Branch : feature/parser  →  origin/main
Changed: 3 files

src/parser/index.ts     ████████░░   82.00%  ⚠
src/util/string.ts      ██████░░░░   60.00%  ✗
src/util/array.ts       █████████░   90.00%  ✓

Total                   ████████░░   77.35%  ✗

✗ Below 80% threshold
```

Gracefully falls back to full-project coverage when there is no git repo, no changed files, or no coverage data for changed files.

## Coverage accuracy

Lumen reports coverage percentages with **2-decimal precision** following industry-standard aggregation rules: zero-denominator metrics (e.g. a file with 0 branches) are treated as **N/A** and excluded from the aggregate rather than counted as 100% covered. Source files (`.ts .tsx .js .jsx .mjs .cjs .py .go .rs .java .kt`) that have **no coverage data at all** are surfaced in a separate **Untested source files** sidecar — informational only, doesn't move the headline %.

## Config file

Persist options per-repo so you don't retype flags. Lumen searches for `lumen.config.json`, `.lumenrc`, or a `"lumen"` key in `package.json`, walking up from the scanned directory to the git root.

```json
{
  "threshold": 80,
  "format": "html",
  "thresholds": {
    "src/legacy/**": 40,
    "src/utils/**": 90
  }
}
```

CLI flags always override config file values. The `thresholds` map accepts glob patterns — the first match wins. Add `.lumen/` to your `.gitignore` to keep snapshots local, or commit it to enforce baselines in CI.

## Coverage enforcement

```bash
lumen . -t 80                  # exit 2 if total line coverage < 80%
lumen . --fail-on-decrease     # exit 2 if any metric dropped since last run
lumen . --show-uncovered       # print exact uncovered line ranges (lcov.info required)
```

`--fail-on-decrease` stores a baseline in `.lumen/snapshot.json` after every successful run. It catches the "still above 80% but slowly sliding" case that pure thresholds miss.

`--show-uncovered` output (requires `lcov.info`):
```
src/util/string.ts: lines 45-72, 88
src/parser/index.ts: lines 12-15, 88-92
```

## AI analysis

Ask Ollama (local), OpenAI, or Anthropic for a plain-language summary and three concrete suggestions — based on metrics only, no source code uploaded.

| Provider | How to enable |
|---|---|
| **Ollama** (local, free) | `ollama serve` + `ollama pull llama3.2` |
| **OpenAI** | `export OPENAI_API_KEY=sk-…` |
| **Anthropic** | `export ANTHROPIC_API_KEY=sk-ant-…` |

## Install the Desktop app

Download the latest release from the [GitHub Releases page](../../releases):

- **Windows** — `Lumen-Setup-<version>.exe` or portable `Lumen-<version>.exe`
- **Linux** — `Lumen-<version>.AppImage` or `.deb`

Or build from source — see [GUIDE.md](./GUIDE.md#building-from-source).

## Documentation

| Document | What's in it |
|---|---|
| [cli/README.md](./cli/README.md) | Full CLI reference — all flags, menu options, test framework setup, CI examples. |
| [GUIDE.md](./GUIDE.md) | Architecture, building from source, desktop app, contributing. |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | How to set up the repo and send a patch. |

## License

MIT © [Ajmal Nasumudeen](https://github.com/ajmaln)
