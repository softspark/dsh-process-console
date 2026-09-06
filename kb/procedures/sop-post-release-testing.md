---
title: "SOP: Post-Release Testing"
category: procedures
service: dsh-process-console
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
- DeepSeek Harness `0.1.1-rc.2` and `pnpm` available.
- Optional for the delegation check: a profile with `@softspark/dsh-orchestrator` and a native Claude Code login, and a harness carrying the `subagent/stream` patch set.

## Procedure

1. Supply-chain verification, mandatory for every public release:
   ```bash
   npm view "@softspark/dsh-process-console@X.Y.Z" --json | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['dist']['attestations']['provenance']['predicateType']=='https://slsa.dev/provenance/v1'; print('PROVENANCE OK')"
   npm audit signatures --registry https://registry.npmjs.org
   ```
2. Install into the disposable profile: `DSH_HOME=<tmp> dsh plugin --profile web add @softspark/dsh-process-console@X.Y.Z --save-exact`.
3. Dump the profile config and confirm one inserted row `ui-process-console` naming the package root.
4. Start DSH with telemetry disabled, open a session in the temporary workspace and send one short prompt.
5. Confirm the conversation header shows Chat, Trajectory, Processes; open Processes and confirm the `main` row and the paired `CALL` and `RESULT` lines of the prompt's tool calls.
6. With the optional delegation profile: delegate an exact marker prompt to Claude Code and confirm a nested `delegation` row whose console ends with a `result` line carrying the marker; without the patch set confirm the same marker appears only in the parent's `RESULT` line.
7. Stop DSH and inspect the disposable profile for unexpected files or credentials.
8. Record the outcome under "Last verified release" below.

## Verification

Provenance and signatures pass, the tab appears from the registry artefact alone, the paired request and response lines render, and DSH stops cleanly.

## Last verified release

Version `1.0.0` passed this procedure on 2026-09-06. The registry artefact carries a SLSA v1 provenance attestation, `npm audit signatures` reports one verified attestation, `dsh plugin --profile web add @softspark/dsh-process-console@1.0.0 --save-exact` into a disposable `DSH_HOME` composed the single `ui-process-console` row naming the package root, and the profile manifest recorded the exact version. Steps 4 to 6 (a live session and a delegation) were not run against the registry artefact on the release host, which has no model credentials; the same source at commit `135e0ca` passed both live checks in the dsh-drydock workbench on 2026-09-05, including a nested Claude Code delegation row with its own console.

## Rollback

Stop the disposable profile and remove the temporary directory. Never overwrite a published version; deprecate it and publish a corrected patch release.
