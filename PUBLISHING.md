# Publishing the `lumen` CLI to npm

This guide walks through publishing the `lumen` CLI in `cli/` as a public npm
package. The `@lumen/core` package is published as a peer (the CLI depends on
it), and the desktop app is shipped as binaries via electron-builder rather
than npm.

## 0. One-time setup

1. **Create an npm account** at <https://www.npmjs.com/signup> (skip if you
   already have one).
2. **Create the `@lumen` scope** (optional, recommended for the core package):
   from the npm site → Add Organization → name `lumen`. Without the scope,
   rename `@lumen/core` to a flat name like `lumen-core` everywhere.
3. **Log in locally**:
   ```bash
   npm login
   ```
4. **Enable 2FA** on your npm account and run `npm profile enable-2fa auth-and-writes`.
5. **Verify the package name is free**:
   ```bash
   npm view lumen        # 404 means it's available
   npm view @lumen/core
   ```
   If `lumen` is taken, pick a scoped name (e.g. `@your-handle/lumen`) and
   update `cli/package.json` accordingly.

## 1. Pre-publish checklist

In `cli/package.json` confirm:

- `name`         → `lumen` (or your chosen scoped name)
- `version`      → bumped following [semver](https://semver.org/) (`0.1.0` → `0.2.0` for new features, `0.1.1` for fixes, `1.0.0` for first stable release)
- `description`  → one-line summary
- `bin.lumen`    → `dist/index.js` (already set)
- `main`         → `dist/index.js`
- `files`        → `["dist", "README.md"]` so unrelated files aren't shipped
- `license`      → `MIT`
- `repository`, `bugs`, `homepage` → point at your GitHub repo
- `keywords`     → e.g. `["repo", "analysis", "report", "html", "cli"]`
- `engines.node` → `>=18`

Add a shebang to the CLI entry (already present: `#!/usr/bin/env node`) so the
binary is executable.

If `@lumen/core` is not also published to npm, you have two options:
1. Publish it first (recommended — see step 3).
2. Bundle it: switch `cli`'s dependency on `@lumen/core` to a copy or build
   step that inlines the compiled JS. Adds friction; avoid if possible.

## 2. Build a clean release

From the monorepo root:

```bash
npm run clean       # removes dist/ from every package
npm install         # fresh dependency resolution
npm run build       # compiles core → cli → desktop
```

Verify the published surface locally:

```bash
cd cli
npm pack --dry-run  # shows the exact files that will be uploaded
```

Sanity-check the size — anything over a few hundred KB usually means
`node_modules` or source maps slipped in.

## 3. Publish `@lumen/core` first

```bash
cd core
npm publish --access public
```

The `--access public` flag is required for scoped packages on a free npm plan.

## 4. Publish the CLI

```bash
cd ../cli
npm publish --access public
```

Verify:

```bash
npm view lumen          # should show the version you just published
npx lumen --help        # should run end-to-end without a local install
```

## 5. Install + smoke test

In a fresh directory:

```bash
npm install -g lumen
lumen --version
lumen .                 # generates an HTML report in ~/Downloads
```

## 6. Tag the release in git

```bash
git tag v0.1.0
git push origin v0.1.0
```

Create a GitHub release from the tag, linking to the npm page.

## 7. Future versions

Use `npm version` to bump and tag in one shot:

```bash
cd cli
npm version patch     # 0.1.0 → 0.1.1
# or: npm version minor  / npm version major
git push --follow-tags
npm publish
```

If the bump touches `core`, version & publish `core` first, then bump
`cli`'s dependency range on `@lumen/core` before publishing the CLI.

## Automating with GitHub Actions

For unattended publishes from a tag push, see `.github/workflows/` for a
starter `release.yml`. You'll need an `NPM_TOKEN` secret on the repo
(`npm token create --read-only=false` from your account).

## Deprecating or unpublishing

- `npm deprecate lumen@"<1.0.0" "please upgrade"` — flag old versions.
- `npm unpublish` works only within 72 hours of publish; prefer deprecation.

## Troubleshooting

| Error | Fix |
| --- | --- |
| `403 Forbidden` on publish | Not logged in, or scope not owned by you. Re-run `npm login`. |
| `E402 Payment Required` | Scoped package without `--access public`. Re-run with that flag. |
| `name already exists` | Pick a scoped name in `package.json`. |
| `cannot resolve @lumen/core` after publish | You published `cli` before `core`. Publish `core`, wait ~1 minute, then re-publish `cli` with a bumped patch version. |
