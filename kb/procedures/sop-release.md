---
title: "SOP: Release"
category: procedures
service: dsh-process-console
version: "2.0.0"
tags: [sop, release, npm, provenance]
last_updated: "2026-09-06"
created: "2026-09-05"
description: "Prepare and publish a provenance-enabled dsh-process-console release."
---

# SOP: Release

## Prerequisites

- The first public release of every SoftSpark module is `1.0.0`; `0.x` tags and publications are forbidden.
- Green `main` and a clean worktree.
- Fresh evidence that a real session shows the Processes tab, that a delegated subagent appears as a nested row with its own console, and that Chat stays on the parent while a child is selected.
- npm trusted publishing configured for the GitHub `npm` environment.

## Procedure

1. Move changelog entries from `Unreleased` to the target version.
2. Update `package.json`. Add no lifecycle scripts.
3. Run the complete pre-commit SOP.
4. Install the release candidate into a clean isolated DSH profile and run the live checks from the prerequisites. A missing tab, a blank child pane, or a Chat that navigates away on selection blocks the tag.
5. Review `npm pack --dry-run` output and the licence files it carries.
6. Create and push the signed tag `v<package-version>` only after both checks and all static gates pass.
7. Let `.github/workflows/publish.yml` verify and publish with provenance.
8. Execute [the post-release SOP](sop-post-release-testing.md) against the exact npm artifact. Record the live tab and delegation checks separately from package installation and attestation checks.

This package intentionally has no `prepublishOnly` or other lifecycle hook. The publish workflow explicitly runs `verify` (including coverage), audit, signatures, and `build` before `npm publish --ignore-scripts --provenance`. This is the required publish gate for an install-without-scripts package.

## Verification

The workflow succeeds, the registry version equals the Git tag, and provenance is present.

## Rollback

Do not reuse or overwrite a published version. Deprecate the defective version and publish a corrected patch.
