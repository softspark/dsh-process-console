---
title: "SOP: Pre-Commit Quality Gate"
category: procedures
service: dsh-process-console
tags: [sop, pre-commit, quality-gate, tests]
last_updated: "2026-09-05"
created: "2026-09-05"
description: "The blocking local gate before every commit."
---

# SOP: Pre-Commit Quality Gate

## Purpose

Catch locally what CI would catch remotely, before the commit exists.

## Procedure

1. `pnpm run verify` — required files, version surfaces, config validation, typecheck, tests. All must pass.
2. Confirm no build output is staged: `git status --short` must not list `lib/`.
3. Conventional commit subject: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`.
4. A change to authorization, the sanitizer, or the size bounds needs a test that fails without it, and a matching `SECURITY.md` update.

## Verification

`pnpm run verify` exits zero and `git status --short` shows only intended files.
