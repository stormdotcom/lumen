# lumen-core

Shared library used by [`lumen-cli`](../cli) and [`lumen-desktop`](../desktop).
Provides a filesystem scanner and a self-contained HTML report renderer.

## Install

```bash
npm install lumen-core
```

## Usage

```ts
import { scanRepo, renderReport } from "lumen-core";

const stats = scanRepo("/path/to/repo");
const html = renderReport(stats);
```

### `scanRepo(path)`

Walks the directory tree at `path`, ignoring common build/dependency folders
(`node_modules`, `.git`, `dist`, `build`, `coverage`, `.next`, etc.) and
returns a `RepoStats` object with:

- `totalFiles`, `totalBytes`, `totalLines`
- `byExtension` — per-extension file count, size, and line totals
- `topDirectories` — files-per-top-level-directory rollup
- `largestFiles` — top 15 files by size
- `notableFiles` — README, LICENSE, package.json, Dockerfile, etc., when present
- `ignored` — list of skipped directories

### `renderReport(stats)`

Turns a `RepoStats` into a single HTML document with all CSS inlined — safe to
email, upload, or open offline. No JavaScript is emitted in the report.

## Develop

This package lives in the [Lumen monorepo](../). From the repo root:

```bash
npm install
npm run build:core
```

The build emits `core/dist/` (JS + `.d.ts` declarations) which both the CLI and
the desktop app consume via workspace linking.
