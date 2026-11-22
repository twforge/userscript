# TW Forge Userscript

Brings TW Forge data into Tribal Wars. Written in TypeScript and type-checked against the published [TW Forge Developer API](https://docs.twforge.net/developer-api/) contract.

## Quick start

```bash
npm install
npm run check   # lint + format check + typecheck + tests
npm run build   # dist/twforge.js (main script) and dist/twforge.user.js (loader, once its URL is set)
npm run dev     # watch + serve the main script locally, with a loader for it
```

Requires Node.js 24+ and npm 11.17+. `.npmrc` skips install scripts, refuses git
dependencies, and only resolves versions that are at least 7 days old (`min-release-age`). Our own contract package
`@twforge/developer-api` is exempt from that cooldown (`min-release-age-exclude`), because its releases already
need a maintainer's 2FA approval. `npm ci` installs exactly what the lockfile says.

## API contract

The API types come from the npm package [`@twforge/developer-api`](https://www.npmjs.com/package/@twforge/developer-api),
released from the `twforge/docs` repository. Nothing is generated or copied into this repo.

- `src/api/client.ts` is a small client of our own, typed with the contract's `paths`. `npm run typecheck` fails if
  the script uses a path, parameter, body or field the contract doesn't have.
- `test/contract.test.ts` checks that the installed contract's major version matches `API_VERSION` and that its
  server URL is the client's default API base URL.

The dependency range `^1.x` keeps the script on API v1. Within it the contract only gains things. Enumerations may also
gain values, so code must handle values it doesn't know. To pick up a new contract release, run
`npm update @twforge/developer-api` (Dependabot opens a separate PR for it). If the script needs something the contract
lacks, change the contract in `twforge/docs` first. Don't add hand-written types here.

## Layout

```
src/main.ts            entry point of the bundle
src/api/client.ts      typed Developer API client
src/globals.d.ts       types for page globals (game_data, TWForgeConfig) and build-time constants
scripts/build.ts       esbuild bundle + userscript header from package.json "userscript"
test/                  node:test tests (Node runs the .ts files directly)
```

esbuild only strips types, and `tsc` only checks them (`noEmit`). `erasableSyntaxOnly` keeps the sources to
TypeScript that can be run by simply removing the types: no enums, no namespaces, no parameter properties.

## Distribution

Like the approved scripts in the game's script database, the script consists of two files, both built by
`npm run build` and both submitted to the game, which hosts them:

- **Main script** `dist/twforge.js`: `src/` bundled into one readable file.
- **Loader** `dist/twforge.user.js`: what players install. It has the userscript header (from the `userscript` field
  of `package.json`), a configuration block players may edit (`window.TWForgeConfig`), and a comment marking where the
  main script is loaded from the URL the game hosts it under. The build puts no URL there and loads nothing itself.

The loader matches every `game.php` page, and the main script decides at runtime what to do there.

For development, `npm run dev` writes a loader that loads the main script from the local dev server instead. Install
`dist/twforge.user.js` once in your userscript manager, then reload the game page after each change. Build-time
overrides: `TWFORGE_BASE` (TW Forge base URL in the loader config, e.g. `http://localhost:4200`) and, for the dev loader
only, `TWFORGE_MAIN_URL` (main script URL).

Tribal Wars script rules:

- The bundle is never minified or obfuscated, and it carries the MIT license banner.
- No third-party code in the bundle. The build fails on any import of a package (see `ownCodeOnly` in
  `scripts/build.ts`). Packages may provide types only, imported with `import type`, which is erased before
  bundling.
- Every submission comes with a changelog entry with a running version number (`CHANGELOG.md`, maintained by
  release-please, see below).

## Releasing

The script is open source (MIT) but not published to npm. `"private": true` in `package.json` only stops an accidental
`npm publish`. Releases are made with [release-please](https://github.com/googleapis/release-please) and handed in
manually through the game's script submission process.

### Versioning

The version is never edited by hand. release-please derives it from the commit messages on `main`, which follow
[Conventional Commits](https://www.conventionalcommits.org/). PRs are squash-merged with the PR title as commit message,
and the `PR Title` check enforces the format.

| Change                                                                     | PR title                      | Bump  | In the changelog |
| -------------------------------------------------------------------------- | ----------------------------- | ----- | ---------------- |
| New feature for players                                                    | `feat: ...`                   | minor | yes              |
| Bug fix, performance improvement                                           | `fix: ...`, `perf: ...`       | patch | yes              |
| Anything players don't notice (refactoring, tests, tooling, docs, CI, ...) | `refactor: ...`, `ci: ...`, … | none  | no               |

The changelog is handed in with every submission, so write the titles of `feat`/`fix`/`perf` PRs for the game's
reviewers and players. Before 1.0.0, breaking changes (`feat!:`) only bump the minor version.

### Steps

1. After changes are merged, release-please opens (or updates) a release PR. It bumps `version` in `package.json` and
   `package-lock.json` and adds the release notes to `CHANGELOG.md` (generated, don't edit by hand).
2. Merging the release PR creates the tag `vX.Y.Z` and the GitHub release. The `Release` workflow builds the script from
   the tag and attaches the main script `twforge.js` and the loader `twforge.user.js` to the release.
3. Submit both attached files to the game, together with the release notes from `CHANGELOG.md`. Always submit the
   files from the GitHub release, never a local build, so every submitted file can be traced back to a tag and a CI
   run.

Nobody pushes `v*` tags by hand. If building or attaching fails, use **Re-run failed jobs** (not "Re-run all jobs",
which would skip the build because the release already exists).

### Repository setup

- **Merging:** allow only squash merges, with "Default to PR title for squash merge commits".
- **Branch protection for `main`:** require PRs and the `CI` and `PR Title` checks.
- **GitHub App for release-please:** install TW Forge's release GitHub App on this repository, then store its
  client ID as the Actions variable `RELEASE_APP_CLIENT_ID` and a private key as the Actions secret
  `RELEASE_APP_PRIVATE_KEY`. With the default `GITHUB_TOKEN`, no checks would run on release PRs.
- **Actions:** all actions are pinned to commit SHAs; Dependabot updates them. Workflows start with `permissions: {}`
  and grant each job only what it needs.
