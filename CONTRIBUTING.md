# Contributing to Lumen

Thanks for your interest in helping out! Lumen is a small TypeScript monorepo
with three packages:

- `core/`     — shared library (`@ajmal_n/lumen-core`)
- `cli/`      — `lumen` CLI binary
- `desktop/`  — Electron GUI (`lumen-desktop`)

## Prerequisites

- Node.js **18+** (Electron 31 ships with Node 20)
- npm 9+
- On Linux, the usual Electron build dependencies (`libgtk-3-0`, `libnss3`, etc.)
  if you want to run the desktop app.

## Setup

```bash
git clone https://github.com/<you>/lumen.git
cd lumen
npm install
npm run build
```

`npm install` at the root installs all workspace dependencies in one pass.
`npm run build` compiles `core`, then `cli`, then `desktop` (the order matters
because `cli` and `desktop` both depend on `@ajmal_n/lumen-core`).

## Running things

```bash
# CLI against the current directory
node cli/dist/index.js .

# Desktop app
npm run desktop
```

## Project layout & where to make changes

| Change | Edit |
| --- | --- |
| Scanning logic (which files / dirs / extensions) | `core/src/scanner.ts` |
| Report HTML / styling | `core/src/report.ts` |
| CLI flags | `cli/src/index.ts` |
| Desktop main process / IPC | `desktop/src/main.ts` |
| Desktop UI | `desktop/src/renderer/` |

Anything that changes the report HTML in `core/src/report.ts` is automatically
picked up by both the CLI and the desktop app's "Export HTML" action.

## Style

- TypeScript strict mode is on. Keep it on.
- No frameworks in the renderer — plain DOM + ES modules.
- Prefer adding to existing files over creating new ones.

## Submitting changes

1. Open an issue describing the change you want to make.
2. Fork & branch (`feat/...`, `fix/...`).
3. `npm run build` must pass.
4. Open a PR with a clear summary and screenshots if UI changed.

## Code of Conduct

Be excellent to each other.
