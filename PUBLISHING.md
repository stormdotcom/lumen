# Publishing the `lumen-cli` package to npm

This is the personal runbook for publishing the CLI in `cli/` to npm. The
package name on npm is **`lumen-cli`**; the installed binary is **`lumen`**.
The shared library `@lumen/core` is published alongside it. The desktop app
ships as binaries via electron-builder, not npm.

## 0. One-time setup

1. **Create an npm account** at <https://www.npmjs.com/signup>.
2. **Create the `@lumen` scope** (recommended for `@lumen/core`):
   npm site → Add Organization → name `lumen`. Without it, rename
   `@lumen/core` to a flat name like `lumen-core` everywhere.
3. **Log in locally**:
   ```bash
   npm login
   ```
4. **Enable 2FA**:
   ```bash
   npm profile enable-2fa auth-and-writes
   ```
5. **Verify the names are free**:
   ```bash
   npm view lumen-cli      # 404 = available
   npm view @lumen/core
   ```
   If `lumen-cli` is taken, pick a scoped name (`@your-handle/lumen-cli`) and
   update `cli/package.json`.

## 1. Pre-publish checklist

In `cli/package.json` confirm:

- `name`         → `lumen-cli`
- `version`      → bump following [semver](https://semver.org/) (`0.1.0` → `0.2.0` features, `0.1.1` fixes, `1.0.0` first stable)
- `description`  → one-line summary
- `bin.lumen`    → `dist/index.js` (already set — this is what makes `lumen` the global command name)
- `main`         → `dist/index.js`
- `files`        → `["dist", "README.md"]`
- `license`      → `MIT`
- `repository`, `bugs`, `homepage` → point at GitHub
- `keywords`     → e.g. `["repo", "analysis", "report", "html", "cli", "lumen"]`
- `engines.node` → `>=18`

The shebang (`#!/usr/bin/env node`) is already at the top of `cli/src/index.ts`
so the installed `lumen` binary is executable on Unix.

## 2. Build a clean release

From the monorepo root:

```bash
npm run clean
npm install
npm run build
```

Inspect the package contents:

```bash
cd cli
npm pack --dry-run    # lists the exact files that would upload
```

Anything over a few hundred KB usually means source maps or `node_modules`
leaked in.

## 3. Publish `@lumen/core` first

`lumen-cli` depends on `@lumen/core`, so core has to exist on the registry
first.

```bash
cd core
npm publish --access public
```

`--access public` is required for scoped packages on free plans.

## 4. Publish the CLI

```bash
cd ../cli
npm publish --access public
```

Verify:

```bash
npm view lumen-cli
npx lumen-cli --help        # runs without a local install
```

## 5. Install + smoke test

In a fresh directory:

```bash
npm install -g lumen-cli
lumen --version
lumen .                     # writes HTML to ~/Downloads
```

## 6. Tag the release in git

```bash
git tag v0.1.0
git push origin v0.1.0
```

Create a GitHub release from the tag and link to the npm page:
<https://www.npmjs.com/package/lumen-cli>.

## 7. Future versions

```bash
cd cli
npm version patch     # 0.1.0 → 0.1.1
# or: npm version minor / npm version major
git push --follow-tags
npm publish
```

If the bump touches `core`, version & publish `core` first, then bump
`lumen-cli`'s dependency range on `@lumen/core` before publishing.

## Automating with GitHub Actions

`.github/workflows/release.yml` is already wired up to publish both packages
on a `v*` tag push. You just need to add an `NPM_TOKEN` repo secret:

```bash
npm token create --read-only=false
# Copy the token, then on GitHub:
# Settings → Secrets and variables → Actions → New repository secret
#   Name: NPM_TOKEN
#   Value: <token>
```

## Deprecating or unpublishing

- `npm deprecate lumen-cli@"<1.0.0" "please upgrade"` — flag old versions.
- `npm unpublish` only works within 72 hours; prefer deprecation.

## Troubleshooting

### `403 Forbidden — Two-factor authentication … is required`

npm requires a 2FA code (or a token that's allowed to skip it) for publishes.
Pick one:

**Interactive — pass the OTP inline:**
```bash
cd core && npm publish --access public --otp=123456
cd ../cli && npm publish --access public --otp=234567
```
The OTP is the current 6-digit code from your authenticator app. You need a
fresh one for each `publish` invocation (the codes rotate every 30s and npm
won't accept the same one twice).

**Scripted / CI — granular token with 2FA bypass:**
1. <https://www.npmjs.com/settings/your-username/tokens>
2. **Generate New Token → Granular Access Token**
3. Configure:
   - Expiration: 365 days (or whatever you're comfortable with)
   - Packages and scopes → **Read and write** for `@lumen/core` and `lumen-cli`
   - **Bypass two-factor authentication when publishing** → ON
4. Copy the token (`npm_…`) and use it:
   ```bash
   echo "//registry.npmjs.org/:_authToken=npm_xxxxxxxx" >> ~/.npmrc
   npm publish --access public    # no --otp needed
   ```
   Or in CI: add the token as the `NPM_TOKEN` GitHub Actions secret —
   `.github/workflows/release.yml` already wires it up.

### Other errors

| Error | Fix |
| --- | --- |
| `403 Forbidden` (no 2FA mention) | Not logged in, or the scope isn't yours. Re-run `npm login`. |
| `E402 Payment Required` | Scoped package without `--access public`. Re-run with that flag. |
| `name already exists` | Pick a scoped name in `cli/package.json` (`@your-handle/lumen-cli`). |
| `cannot resolve @lumen/core` after publish | You published `lumen-cli` before `core`. Publish `core`, wait ~1 min, bump `lumen-cli`'s patch version, re-publish. |
| `lumen: command not found` after global install | Make sure the global npm bin dir is on your `PATH` (`npm config get prefix`). |
