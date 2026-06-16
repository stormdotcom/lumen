# @ajmal_n/lumen-cli

The Lumen command-line interface. Published to npm as **`@ajmal_n/lumen-cli`** and
installs the **`lumen`** binary.

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
| `--print-path` | Print only the path to the generated report (machine-readable) | off |
| `-V, --version` | Print version | |
| `-h, --help` | Print help | |

The file extension is chosen automatically from `--format` (`.html` or `.md`).

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
