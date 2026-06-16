# Publishing `lumen-cli` and `lumen-core` to npm

Personal runbook. Both packages are unscoped (no `@org/` prefix), so no npm
organization setup is needed.

- `lumen-core` — the scanner + report library (must be published first).
- `lumen-cli` — the CLI, depends on `lumen-core`. Installs the `lumen`
  binary on the user's machine.

## 0. One-time setup

1. **npm account** at <https://www.npmjs.com/signup>.
2. **Log in locally**:
   ```bash
   npm login
   ```
3. **Enable 2FA**:
   ```bash
   npm profile enable-2fa auth-and-writes
   ```
4. **Verify the names are free**:
   ```bash
   npm view lumen-core   # 404 = available
   npm view lumen-cli
   ```
   If either is taken, switch to a scoped name like `@your-handle/lumen-cli`
   and update the affected `package.json` + the `lumen-core` import paths.

## 1. Pre-publish checklist

In `core/package.json` and `cli/package.json` confirm:

- `name`, `version`, `description`, `license`, `repository`, `bugs`, `homepage`,
  `keywords`, `engines.node` are set.
- `cli/package.json` has `"bin": { "lumen": "dist/index.js" }` — this is what
  makes the installed command `lumen`, not `lumen-cli`.
- Both packages have `"files": ["dist", "README.md"]` so nothing extra ships.

`cli/src/index.ts` has the `#!/usr/bin/env node` shebang already.

## 2. Build a clean release

```bash
npm run clean
npm install
npm run build
```

Inspect what would ship:

```bash
cd core && npm pack --dry-run
cd ../cli && npm pack --dry-run
```

Anything larger than a few hundred KB usually means source maps or
`node_modules` leaked in.

## 3. Publish `lumen-core` first

```bash
cd core
npm publish
```

`lumen-cli` depends on `lumen-core@0.1.0`, so the registry must already
contain that version when `lumen-cli` is published.

## 4. Publish `lumen-cli`

```bash
cd ../cli
npm publish
```

Verify:

```bash
npm view lumen-cli
npx lumen-cli --help
```

## 5. Install + smoke test

In a fresh terminal / directory:

```bash
npm install -g lumen-cli
lumen --version
lumen .                 # writes HTML to ~/Downloads
```

## 6. Tag the release in git

```bash
git tag v0.1.0
git push origin v0.1.0
```

Then create a GitHub release from the tag, linking
<https://www.npmjs.com/package/lumen-cli>.

## 7. Future versions

```bash
cd core && npm version patch && npm publish
cd ../cli
# bump cli's dependency on lumen-core if core changed:
#   "dependencies": { "lumen-core": "0.1.1" }
npm version patch && npm publish
git push --follow-tags
```

## Automating with GitHub Actions

`.github/workflows/release.yml` runs on `v*` tag pushes and publishes both
packages. You need an `NPM_TOKEN` repo secret:

```bash
npm token create --read-only=false
# Or, easier — use a granular token (see Troubleshooting below).
```

Then on GitHub: **Settings → Secrets and variables → Actions → New repository
secret**, name `NPM_TOKEN`, paste the token.

## Deprecating or unpublishing

- `npm deprecate lumen-cli@"<1.0.0" "please upgrade"` — flag old versions.
- `npm unpublish` works only within 72 hours; prefer deprecation.

## Troubleshooting

### `403 Forbidden — Two-factor authentication … is required`

npm requires a 2FA code (or a token that's allowed to skip it).

**Interactive — pass the OTP inline:**
```bash
cd core && npm publish --otp=123456
cd ../cli && npm publish --otp=234567
```
You need a fresh code for each `publish` call (codes rotate every 30s and npm
rejects a reused code).

**Scripted / CI — granular token with 2FA bypass:**
1. <https://www.npmjs.com/settings/your-username/tokens>
2. **Generate New Token → Granular Access Token**
3. Configure:
   - Expiration: 365 days
   - Packages and scopes → **Read and write** for `lumen-core` and `lumen-cli`
   - **Bypass two-factor authentication when publishing** → ON
4. Use it:
   ```bash
   echo "//registry.npmjs.org/:_authToken=npm_xxxxxxxx" >> ~/.npmrc
   npm publish    # no --otp needed
   ```
   Or paste it into the `NPM_TOKEN` GitHub Actions secret.

### `404 Not Found - PUT … @lumen%2fcore`

You tried to publish a scoped package whose scope you don't own. Either
create the org at <https://www.npmjs.com/org/create> (free for public
packages), or — as in this repo — switch to an unscoped name (`lumen-core`).

### Other errors

| Error | Fix |
| --- | --- |
| `403 Forbidden` (no 2FA mention) | Not logged in, or the name is taken by someone else. Re-run `npm login` and check `npm whoami`. |
| `E402 Payment Required` | Scoped package without `--access public`. Add the flag or switch to an unscoped name. |
| `name already exists` | Pick a scoped name like `@your-handle/lumen-cli`. |
| `cannot resolve lumen-core` after publish | You published `lumen-cli` before `lumen-core`. Publish `lumen-core`, wait ~1 min, bump `lumen-cli`'s patch version, re-publish. |
| `lumen: command not found` after global install | Add the global npm bin dir to your `PATH` (`npm config get prefix`). |
