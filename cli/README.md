# lumen (CLI)

Command-line interface for Lumen. Scans a directory and writes a self-contained
HTML report.

## Install

From the monorepo root:

```bash
npm install
npm run build
```

## Usage

```bash
node cli/dist/index.js [path] [options]

# or, once published:
lumen [path] [options]
```

### Options

| Flag | Description | Default |
| --- | --- | --- |
| `-o, --out <dir>` | Output directory for the HTML report | `~/Downloads` |
| `-n, --name <name>` | Override the report filename (no extension) | timestamped |
| `--print-path` | Print only the path to the generated report | off |
| `-V, --version` | Print version | |
| `-h, --help` | Print help | |

### Examples

```bash
# Scan current directory, report into Downloads
lumen .

# Scan a specific repo, write to a custom location
lumen ~/code/myproject --out ~/reports --name myproject-snapshot
```
