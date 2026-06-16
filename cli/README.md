# lumen-cli

The Lumen command-line interface. Published to npm as **`lumen-cli`** and
installs the **`lumen`** binary.

## Install

```bash
npm install -g lumen-cli
```

Or run on demand without installing:

```bash
npx lumen-cli .
```

## Usage

```bash
lumen [path] [options]
```

### Options

| Flag | Description | Default |
| --- | --- | --- |
| `-o, --out <dir>` | Output directory for the HTML report | `~/Downloads` |
| `-n, --name <name>` | Override the report filename (no extension) | timestamped |
| `--print-path` | Print only the path to the generated report (machine-readable) | off |
| `-V, --version` | Print version | |
| `-h, --help` | Print help | |

### Examples

```bash
# Scan current directory, report into Downloads
lumen .

# Scan a specific repo, write to a custom location
lumen ~/code/myproject --out ~/reports --name myproject-snapshot

# Pipe the report path to another tool
xdg-open "$(lumen . --print-path)"
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
