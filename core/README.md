# @lumen/core

Shared library used by the `lumen` CLI and `lumen-desktop` apps. Provides a
filesystem scanner and a self-contained HTML report renderer.

## Usage

```ts
import { scanRepo, renderReport } from "@lumen/core";

const stats = scanRepo("/path/to/repo");
const html = renderReport(stats);
```

`scanRepo` walks the directory tree, ignoring common build/dependency folders
(`node_modules`, `.git`, `dist`, `build`, etc.) and returns aggregated statistics
about file types, sizes, line counts, and notable project files.

`renderReport` turns those statistics into a single HTML document with inline
CSS — no external assets, safe to email or upload anywhere.
