---
title: "SOP: Release"
category: procedures
service: dsh-process-console
version: "2.0.0"
tags: [sop, release, npm, provenance, local-gates]
last_updated: "2026-09-24"
created: "2026-09-05"
description: "Prepare a dsh-process-console release and publish it with the single local release command."
---

# SOP: Release

```bash
npm run release -- X.Y.Z             # gates, Linux run, pack smoke, signed tag, push, watch publish
npm run release -- X.Y.Z --dry-run   # everything up to the tag, then prints the rest
```

`pnpm run release X.Y.Z` is the same command.

`scripts/release.sh` is the only supported way to create a release tag. GitHub Actions no longer tests anything: there is no CI on pushes or pull requests, and `publish.yml` only turns a tag into an npm package and a GitHub Release. A tag made by hand ships whatever the commit holds, gated or not. The shared model is the SoftSpark SOP "Local Release Gates, Publish-Only CI"; this page keeps what is specific to dsh-process-console.

## Prerequisites

- The first public release of every SoftSpark module is `1.0.0`; `0.x` tags and publications are forbidden.
- Fresh evidence that a real session shows the Processes tab, that a delegated subagent appears as a nested row with its own console, and that Chat stays on the parent while a child is selected.
- npm trusted publishing configured for the GitHub `npm` environment.
- pnpm `11.24.0` (the `packageManager` version). Without a pnpm on `PATH` the script uses corepack's shim for that version.
- Docker running, for the Linux run.
- Git configured to SSH-sign tags.

## Procedure

1. Move changelog entries from `Unreleased` to `## [X.Y.Z] - YYYY-MM-DD`.
2. Update `package.json`. Add no lifecycle scripts.
3. Run the complete pre-commit SOP.
4. Install the release candidate into a clean isolated DSH profile and run the live checks from the prerequisites. A missing tab, a blank child pane, or a Chat that navigates away on selection blocks the tag.
5. Commit `chore: release vX.Y.Z` and push `main`.
6. Run `npm run release -- X.Y.Z`. It stops at the first failure and logs to `${TMPDIR:-/tmp}/dsh-process-console-release-X.Y.Z/`:

| Step | What it checks or does |
|---|---|
| 1. Preconditions | on `main`, clean tree, `main` equals `origin/main` after a fetch, `X.Y.Z` is semver, `vX.Y.Z` exists neither locally nor on origin |
| 2. Version and notes | `verify-version-sync.mjs --tag vX.Y.Z` (manifest, newest numbered CHANGELOG heading), a dated `## [X.Y.Z]` heading, `HEAD` is `chore: release vX.Y.Z` |
| 3. Gates | pnpm version, `pnpm install --frozen-lockfile --ignore-scripts`, `pnpm run verify` (required files, version surfaces, licence, manifest, KB, configuration, lint, typecheck, tests with 70 percent coverage on every metric), no build output tracked, `audit`, `audit:permissions`, `audit:dependencies`, `audit:signatures`, SARIF generation, `build` (host, client, export targets), `npm pack --dry-run`, publish controls in `publish.yml` (`--provenance`, `id-token: write`, `--ignore-scripts`) |
| 4. Linux run | the same gate in a throwaway `node:24` container with pnpm `11.24.0`, repository copied in, run as the non-root `node` user |
| 5. Build and smoke | `npm pack`; the tarball must carry `lib/index.js`, `lib/invariant.js`, `lib/client.js`, the declarations, `cordis.patch.yml`, `LICENSE` and `NOTICE` and no sources, tests, KB, scripts or patches; `lib/index.js` and `lib/invariant.js` are imported once from the unpacked tarball |
| 6. Tag and push | SSH-signed tag `vX.Y.Z` (`Release vX.Y.Z`) on `HEAD`, push `main`, then `git push origin refs/tags/vX.Y.Z` |
| 7. Watch publish | `gh run watch` on the tag's `publish.yml` run, then `npm view @softspark/dsh-process-console@X.Y.Z` and the GitHub Release |

7. Execute [the post-release SOP](sop-post-release-testing.md) against the exact npm artifact. Record the live tab and delegation checks separately from package installation and attestation checks.

**Why the Linux run applies here.** `publish.yml` builds the artefact on Linux with native tools (rolldown, lightningcss); a Linux-only build failure would otherwise surface after the tag. The old CI also ran on Windows; nothing local replaces that.

**SARIF is no longer uploaded.** CI used to push the audit SARIF to GitHub code scanning. The script writes it to the log directory instead.

## What publish.yml still does

This package intentionally has no `prepublishOnly` or other lifecycle hook, and `lib/` is not committed. On a `v*` tag, in the `npm` environment, the workflow runs checkout, pnpm and Node setup, `verify-version-sync.mjs --tag`, `pnpm install --frozen-lockfile --ignore-scripts`, `pnpm run build`, then `npm publish --provenance --access public --ignore-scripts` and the GitHub Release. No verify, test or audit step: those ran in the release script.

## Verification

The script confirms the publish run succeeded, the registry version equals the Git tag, and the GitHub Release exists. Provenance is checked by the post-release SOP.

## Rollback

Do not reuse or overwrite a published version. Deprecate the defective version and publish a corrected patch through the same script.
