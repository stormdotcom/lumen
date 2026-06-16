# lumen-desktop

Cross-platform Electron GUI for Lumen. Pick a folder, get an interactive
repository insight view, optionally export the report as standalone HTML.

Targets **Windows** and **Linux** (macOS builds also work but are not part of
the maintained release matrix).

> Not published to npm — distributed as packaged binaries (NSIS, portable EXE,
> AppImage, .deb). For the npm-installable command-line tool, see
> [`@ajmal_n/lumen-cli`](../cli).

## Develop

From the monorepo root:

```bash
npm install
npm run build
npm run desktop
```

Or, from this package:

```bash
npm run build     # compiles main + preload + renderer, copies HTML/CSS
npm run start     # launches electron .
npm run dev       # build then start
```

## Package binaries

Builds use [electron-builder](https://www.electron.build/). Output goes to
`desktop/release/`.

```bash
# Windows installer + portable .exe
npm run dist:win

# Linux AppImage + .deb
npm run dist:linux

# Both
npm run dist:all
```

## Architecture

```
src/
├── main.ts           Electron main process (BrowserWindow, IPC handlers)
├── preload.ts        contextBridge → window.lumen API
└── renderer/
    ├── index.html    Shell UI
    ├── app.ts        Renderer logic (compiled to dist/renderer/app.js)
    └── styles.css    Light-theme styles
```

The renderer never touches Node directly — it asks the main process to pick a
directory and run [`@ajmal_n/lumen-core`](../core)'s scanner, then renders the returned
stats. The same `renderReport` function used by [`@ajmal_n/lumen-cli`](../cli) backs the
"Export HTML" action, so the desktop's export and the CLI's report are
byte-for-byte identical.
