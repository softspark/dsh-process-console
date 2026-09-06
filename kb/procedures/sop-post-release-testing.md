---
title: "SOP: Post-Release Testing"
category: procedures
service: dsh-process-console
version: "2.0.0"
tags: [sop, post-release, smoke-test, provenance, dsh]
last_updated: "2026-09-06"
created: "2026-09-06"
description: "Verify the published bundle from the npm registry in an isolated DSH profile and confirm the provenance attestation, without changing production state."
---

# SOP: Post-Release Testing

## Purpose

Confirm that the exact registry artefact installs as a profile bundle, registers the Processes tab, and carries a provenance attestation.

## Prerequisites

- The release workflow finished and the registry answers for the version (a new package can take about two minutes to become readable).
- A disposable `DSH_HOME` and workspace under a temporary directory.
- DeepSeek Harness `0.1.2-rc.1` and `pnpm` available.
- Optional for the delegation check: a profile with `@softspark/dsh-orchestrator` and a native Claude Code login, and a harness carrying the `subagent/stream` patch set.

## Procedure

1. Supply-chain verification, mandatory for every public release:
   ```bash
   npm view "@softspark/dsh-process-console@X.Y.Z" --json | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['dist']['attestations']['provenance']['predicateType']=='https://slsa.dev/provenance/v1'; print('PROVENANCE OK')"
   ```
2. Install into the disposable profile: `DSH_HOME=<tmp> dsh plugin --profile web add @softspark/dsh-process-console@X.Y.Z --save-exact`.
3. Run `npm audit signatures --registry https://registry.npmjs.org` from the installed disposable profile directory. Dump the profile config and confirm one inserted row `ui-process-console` naming the package root.
4. Start DSH with telemetry disabled, open a session in the temporary workspace and send one short prompt.
5. Confirm the conversation header shows Chat, Trajectory, Processes; open Processes and confirm the `main` row and the paired `CALL` and `RESULT` lines of the prompt's tool calls.
6. With the optional delegation profile: delegate an exact marker prompt to Claude Code and confirm a nested `delegation` row whose console ends with a `result` line carrying the marker; without the patch set confirm the same marker appears only in the parent's `RESULT` line.
7. Stop DSH and inspect the disposable profile for unexpected files or credentials.
8. Record the outcome under "Last verified release" below.

## Verification

Provenance and signatures pass, the tab appears from the registry artefact alone, the paired request and response lines render, and DSH stops cleanly.

## Last verified release

Version `1.0.0` has partial registry evidence from 2026-09-06, not a complete pass of this procedure. The registry artefact carries a SLSA v1 provenance attestation, `npm audit signatures` reports one verified attestation, `dsh plugin --profile web add @softspark/dsh-process-console@1.0.0 --save-exact` into a disposable `DSH_HOME` composed the single `ui-process-console` row naming the package root, and the profile manifest recorded the exact version. Steps 4 to 6 (a live session and a delegation) were not run against the registry artefact on the release host, which has no model credentials; the same source at commit `135e0ca` passed both live checks in the dsh-drydock workbench on 2026-09-05, including a nested Claude Code delegation row with its own console.

## Version 2.0.0 candidate qualification (2026-09-06)

The tarball built from the original repository (SHA-1 `20832a8f3c59fcd0f3e169d4f1af2a3fe8a1d855`) was installed into an isolated DSH `0.1.2-rc.1` profile with telemetry disabled. The installed client matched the built client byte for byte. Node `22.22.2`, pnpm `11.24.0`, and Playwright `1.63.0` were used.

- `pnpm run verify`, `pnpm run build`, and `pnpm run audit` passed: 50 tests; coverage 92.81% statements, 82.98% branches, 84.84% functions, 94.88% lines.
- A real Codex parent completed a file write and Claude Code/Copilot Gemini delegations. Processes showed their paired CALL/RESULT records and exact returned markers.
- A native DSH subagent read the file. Selecting its row displayed its own read CALL, RESULT with `UI_PREVIEW_20260906`, and assistant answer `UI_NATIVE_CHILD_20260906`.
- The browser's WebSocket carried a `kind: subagent` journal request with the actual parent id, child id, and `one-shot` mode. The root URL and parent header stayed unchanged; no force-click or alternate host endpoint was used.
- Cancelling an active `sleep 60` call produced `AbortError/ABORTED`, removed the running row, and restored the composer. After a clean DSH restart, the native subagent task completed successfully.
- Page and console error capture remained empty. The console uses the native composer-overlay layout contract so the shell's resize handles do not cover its rows.

## Version 2.0.0 published artifact (2026-09-06)

- Signed tag `v2.0.0` targets `225f11ddca0fb3d5d313313cac2934e5ab1c9038`. The existing SSH signing key verified successfully without changing global Git configuration.
- [Release-head CI](https://github.com/softspark/dsh-process-console/actions/runs/34055691711) and [publication](https://github.com/softspark/dsh-process-console/actions/runs/34055829862) completed successfully.
- npm reports version `2.0.0`, SHA-1 `312993a7f14a707cbbcf56e0b306f195302cdd19`, and SLSA v1 provenance. `npm audit signatures` against a clean registry installation verified the package's signature and attestation.
- All 31 published files were compared with the original repository build, including LICENSE, NOTICE, and every export target. Only CSS-map property ordering differed in `lib/client.js`; the map values and all other content matched.
- Both UI plugins were installed by exact npm version into the disposable DSH profile and the app restarted. The running console client matched the registry installation byte for byte.
- On the exact published console, an actual child row opened its own read CALL/RESULT and `UI_NATIVE_CHILD_20260906` answer through a WebSocket journal request carrying the durable parent/child address. The parent header and URL stayed unchanged. Returning to main removed the child transcript without errors.
- The combined registry smoke also confirmed file-preview's open/close/reopen and native ZIP fallback: the original opener returned HTTP 200 with `ok: true` and `opened: true`, with no preview dialog for the ZIP.
- Browser page/console error capture was empty. The disposable DSH process was stopped after verification.

## Rollback

Stop the disposable profile and remove the temporary directory. Never overwrite a published version; deprecate it and publish a corrected patch release.
