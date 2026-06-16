# Lumen

Repository insight tools — a CLI and a cross-platform desktop GUI that scan a code
repository and produce a clean, self-contained HTML report.

```
lumen/
├── core/        Shared scanner + report renderer (TypeScript library)
├── cli/         `lumen` command-line tool
└── desktop/     Electron desktop GUI (Windows + Linux)
```

## Quick start

```bash
npm install
npm run build

# CLI
node cli/dist/index.js .

# Desktop
npm run desktop
```

The CLI writes an HTML report to your `Downloads` folder by default. The desktop
app renders the same report inside an Electron window and can export it to disk.

## Packages

| Package | Description |
| --- | --- |
| [`@lumen/core`](./core) | File-tree scanner and HTML report renderer. |
| [`lumen`](./cli) | CLI binary wrapping `@lumen/core`. |
| [`lumen-desktop`](./desktop) | Electron-based GUI for Windows and Linux. |

## License

MIT — see [LICENSE](./LICENSE).
