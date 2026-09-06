---
title: "SOP: Pre-Commit Quality Gate"
category: procedures
service: dsh-process-console
version: "2.0.0"
tags: [sop, pre-commit, quality-gate, tests]
last_updated: "2026-09-06"
created: "2026-09-05"
description: "The blocking local gate before every commit."
---

# SOP: Pre-Commit Quality Gate

## Purpose

Catch locally what CI would catch remotely, before the commit exists.

## Procedure

1. `pnpm run verify`: required files, version surfaces, license, manifest, KB, configuration, lint, typecheck, and the complete test suite. Statements, branches, functions, and lines must each reach 70% coverage across all source files except declaration-only files.
2. Confirm no build output is staged: `git status --short` must not list `lib/`.
3. Conventional commit subject: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`.
4. A change to session selection, event folding, subscription cleanup, or rendering needs matching unit and component tests. Update the security model when the read-only boundary changes.
5. `pnpm run build`: compile host and browser declarations, build both artifacts, and verify every export target exists.

## Verification

`pnpm run verify` exits zero and `git status --short` shows only intended files.
