# lumen-desktop

Cross-platform Electron GUI for Lumen. Pick a folder, get an interactive
repository insight view, optionally export the report as standalone HTML.

Targets **Windows** and **Linux** (macOS builds also work but are not part of
the maintained release matrix).

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
directory and run `@lumen/core`'s scanner, then renders the returned stats.
