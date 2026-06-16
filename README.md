# Lumen

> Repository insight in one click.

Lumen scans a code repository and produces a clean, self-contained HTML or
Markdown report covering its file tree, sizes, line counts, languages, largest
files — and an optional **test-coverage breakdown** that works with Jest,
Vitest, Nx, Jasmine, Karma, Mocha+nyc, AVA, or tap.

It ships in two forms:

- **`@ajmal_n/lumen-cli`** — a tiny Node.js CLI that drops a report into your `Downloads` folder.
- **`lumen-desktop`** — a cross-platform Electron GUI for Windows and Linux.

## Install the CLI

```bash
npm install -g @ajmal_n/lumen-cli
lumen .
```

That's it. Lumen scans the current directory and writes
`~/Downloads/lumen-<repo>-<timestamp>.html`.

Run on demand without installing:

```bash
npx @ajmal_n/lumen-cli .
```

With test coverage (after `jest --coverage`, `vitest run --coverage`,
`nx test --coverage`, or `nyc mocha`):

```bash
lumen . -f md -o . -n COVERAGE -t 80
# → ./COVERAGE.md, exits 2 if total line coverage is below 80%
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
