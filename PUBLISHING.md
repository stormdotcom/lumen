# Publishing `@ajmal_n/lumen-cli` and `@ajmal_n/lumen-core` to npm

Personal runbook. Both packages are scoped under your npm username
(`@ajmal_n`) — npm auto-provisions the scope from your account, no org
setup needed, and scoped names skip the name-similarity check that blocked
unscoped `lumen-core`.

- `@ajmal_n/lumen-core` — the scanner + report library (must be published first).
- `@ajmal_n/lumen-cli` — the CLI, depends on core. Installs the **`lumen`**
  binary via its `bin` field.

> Even though the npm package is scoped (`@ajmal_n/lumen-cli`), the
> command users type stays plain `lumen` — because `bin.lumen` in
> `cli/package.json` controls the command name, independently of the
> package name.

## 0. One-time setup

1. **npm account** at <https://www.npmjs.com/signup> (your username here is
   `ajmal_n`).
2. **Log in locally**:
   ```bash
   npm login
   ```
3. **Enable 2FA**:
   ```bash
   npm profile enable-2fa auth-and-writes
   ```

No scope/org creation needed — `@ajmal_n` belongs to your account automatically.

## 1. Pre-publish checklist

In `core/package.json` and `cli/package.json` confirm:

- `name` is `@ajmal_n/lumen-core` / `@ajmal_n/lumen-cli`
- `version` follows [semver](https://semver.org/)
- `description`, `license`, `repository`, `bugs`, `homepage`, `keywords`,
  `engines.node` are set
- `cli/package.json` has `"bin": { "lumen": "dist/index.js" }`
- Both have `"files": ["dist", "README.md"]`

The shebang (`#!/usr/bin/env node`) is already in `cli/src/index.ts`.

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

## 3. Publish core first

```bash
cd core
npm publish --access=public
```

`--access=public` is **required** for scoped packages on a free npm account
(without it, npm publishes them as private and rejects the request).

## 4. Publish the CLI

```bash
cd ../cli
npm publish --access=public
```

Verify:

```bash
npm view @ajmal_n/lumen-cli
npx @ajmal_n/lumen-cli --help
```

## 5. Install + smoke test

```bash
npm install -g @ajmal_n/lumen-cli
lumen --version
lumen .                 # writes HTML to ~/Downloads
```

Note the install line uses the scoped package name, but the command is
still just `lumen`.

## 6. Tag the release in git

```bash
git tag v0.1.0
git push origin v0.1.0
```

Then create a GitHub release linking to the npm page:
<https://www.npmjs.com/package/@ajmal_n/lumen-cli>.

## 7. Future versions

```bash
cd core && npm version patch && npm publish --access=public
cd ../cli
# If core changed, bump the dependency range in cli/package.json:
#   "dependencies": { "@ajmal_n/lumen-core": "0.1.1" }
npm version patch && npm publish --access=public
git push --follow-tags
```

## Automating with GitHub Actions

`.github/workflows/release.yml` runs on `v*` tag pushes and publishes both
packages with `--access=public`. You need an `NPM_TOKEN` repo secret.

The easiest token to use is a **granular access token with 2FA bypass**:

1. <https://www.npmjs.com/settings/ajmal_n/tokens>
2. **Generate New Token → Granular Access Token**
3. Configure:
   - Expiration: 365 days
   - Packages and scopes: **Read and write** for `@ajmal_n/lumen-core` and
     `@ajmal_n/lumen-cli` (or the whole `@ajmal_n` scope)
   - **Bypass two-factor authentication when publishing** → ON
4. Copy the token (`npm_…`) and on GitHub:
   **Settings → Secrets and variables → Actions → New repository secret**,
   name `NPM_TOKEN`, paste it.

## Deprecating or unpublishing

- `npm deprecate "@ajmal_n/lumen-cli@<1.0.0" "please upgrade"` — flag old versions.
- `npm unpublish` works only within 72 hours; prefer deprecation.

## Troubleshooting

### `403 Forbidden — Two-factor authentication … is required`

Add `--otp=<6-digit code>` from your authenticator:
```bash
cd core && npm publish --access=public --otp=123456
cd ../cli && npm publish --access=public --otp=234567
```
Use a fresh code for each call. For unattended publishes, use a granular
token with 2FA bypass (see GitHub Actions section above).

### `403 Forbidden — Package name too similar to existing package`

This is what triggered the move to a scoped name. If npm flags your scoped
name too, you've collided with another scope's package — pick a different
name segment (e.g. `@ajmal_n/lumen-tool-cli`).

### `404 Not Found - PUT … @yourscope%2fpkg`

You're trying to publish under a scope that doesn't belong to you (or doesn't
exist). `@ajmal_n` is yours, but if you fork this repo and forget to rename
the scope, npm will 404. Update both `package.json` `name` fields and the
imports in `cli/src/index.ts`, `desktop/src/main.ts`, `desktop/src/preload.ts`,
and the dependency entries in `cli/package.json` + `desktop/package.json`.

### Other errors

| Error | Fix |
| --- | --- |
| `403 Forbidden` (no 2FA mention) | Not logged in, or `npm whoami` shows the wrong user. Re-run `npm login`. |
| `E402 Payment Required` | Scoped package without `--access=public`. Always pass that flag. |
| `cannot resolve @ajmal_n/lumen-core` after publish | You published the CLI before core. Publish core, wait ~1 min, bump the CLI's patch version, re-publish. |
| `lumen: command not found` after global install | Add the global npm bin dir to your `PATH` (`npm config get prefix`). |
