# dsh-process-console

## Overview

A DeepSeek Harness plugin: a Processes tab next to Chat and Trajectory that prints every process of a conversation as a live console. One npm package, browser half only, installed as a single profile bundle.

## Tech stack

TypeScript (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), React 18, Vitest, rolldown plus lightningcss for the browser bundle, pnpm.

## Commands

| Command | Purpose |
|---|---|
| `pnpm run verify` | The gate: required files, version surfaces, config, typecheck, tests |
| `pnpm test` | Vitest |
| `pnpm run build` | Host entries and the browser bundle |

## Key conventions

- **Read-only.** The tab never prompts, cancels or renames a session.
- **Public object layer only.** Data comes from `ConversationSnapshot` and `SessionListState`; no private event registration, no cross-package value imports beyond React.
- **Components never see ctx.** Live facts arrive through `useSessions` and the injected `useProcess` hook; gestures leave through injected callbacks.
- **`open()` is duck-typed.** The public session face does not declare it; a face without it renders an explicit unavailable state, never an empty pane.
- **Tokens only** in CSS. No raw colours.
- `lib/` is build output and is never committed.
