# Lumen

> Repository insight in one click.

Lumen scans a code repository and produces a clean, self-contained HTML report
covering its file tree, sizes, line counts, languages, and largest files.

It ships in two forms:

- **`lumen-cli`** — a tiny Node.js CLI that drops a report into your `Downloads` folder.
- **`lumen-desktop`** — a cross-platform Electron GUI for Windows and Linux.

## Install the CLI

```bash
npm install -g lumen-cli
lumen .
```

That's it. Lumen scans the current directory and writes
`~/Downloads/lumen-<repo>-<timestamp>.html`.

Run on demand without installing:

```bash
npx lumen-cli .
```

## Install the Desktop app

Download the latest release for your platform from the
[GitHub Releases page](../../releases):

- **Windows** — `Lumen-Setup-<version>.exe` or the portable `Lumen-<version>.exe`
- **Linux** — `Lumen-<version>.AppImage` or the `.deb` package

Or build it yourself — see [GUIDE.md](./GUIDE.md#building-the-desktop-app).

## Documentation

| Document | What's in it |
| --- | --- |
| [GUIDE.md](./GUIDE.md) | Full guide — CLI usage, desktop UI, architecture, building, customizing. |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | How to set up the repo and submit changes. |
| Package docs | [`core/`](./core) · [`cli/`](./cli) · [`desktop/`](./desktop) |

## License

MIT — see [LICENSE](./LICENSE).
