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

### Options

| Flag | Description | Default |
| --- | --- | --- |
| `-f, --format <fmt>` | Output format — `html` or `markdown` (alias: `md`) | `html` |
| `-o, --out <dir>` | Output directory for the report | `~/Downloads` |
| `-n, --name <name>` | Override the report filename (no extension) | timestamped |
| `--coverage-dir <dir>` | Path to coverage output dir (e.g. `./coverage`). Auto-discovered if omitted. | auto |
| `--no-coverage` | Skip test-coverage detection entirely | off |
| `-t, --threshold <pct>` | Fail with exit code `2` if total line coverage is below this percent | none |
| `--print-path` | Print only the path to the generated report (machine-readable) | off |
| `-V, --version` | Print version | |
| `-h, --help` | Print help | |

The file extension is chosen automatically from `--format` (`.html` or `.md`).

### Test coverage

Lumen auto-detects your testing framework from `package.json` / config files
and walks the repo for any `coverage/coverage-summary.json` (Istanbul) or
`lcov.info` file — including Nx-style nested layouts like
`coverage/apps/<name>/coverage-summary.json`.

To produce coverage data, run your test runner with coverage enabled before
running `lumen`:

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

Then:

```bash
lumen . -f md -o . -n COVERAGE -t 80
```

### Examples

```bash
# Scan current directory, default HTML report into Downloads
lumen .

# Markdown report — drop directly into a wiki, GitHub issue, or README
lumen . --format markdown

# Short alias
lumen . -f md

# Scan a specific repo, write to a custom location
lumen ~/code/myproject --out ~/reports --name myproject-snapshot

# Pipe the report path to another tool
xdg-open "$(lumen . --print-path)"

# Markdown straight into a file in the current dir
lumen . -f md -o . -n REPORT
# → ./REPORT.md

# Coverage report with a CI gate (exit 2 if lines < 80%)
lumen . -f md -o . -n COVERAGE --threshold 80

# Point at a non-standard coverage location
lumen . --coverage-dir ./apps/web/coverage

# Skip coverage detection entirely
lumen . --no-coverage
```

## Develop

This package lives in the [Lumen monorepo](../). From the repo root:

```bash
npm install
npm run build:cli
node cli/dist/index.js .
```

## Publishing

See [PUBLISHING.md](../PUBLISHING.md) at the repo root (personal runbook,
gitignored).
