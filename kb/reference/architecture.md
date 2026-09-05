---
title: "dsh-process-console Architecture"
category: reference
service: dsh-process-console
tags: [architecture, dsh, plugin, cordis, client, slot, subagent]
last_updated: "2026-09-05"
created: "2026-09-05"
description: "The slot the tab registers into, the data path from session windows to console lines, and why the package is standalone."
---

# dsh-process-console Architecture

## Purpose

Show every process of a conversation, the main agent and each subagent, as a live console next to Chat and Trajectory, without modifying the harness.

## One half, one row

| Half | Entry | Responsibility |
|---|---|---|
| Host | `@softspark/dsh-process-console` | No-op. DSH imports a row's name on the host before it serves the page, so the root must be Node-importable. |
| Browser | `@softspark/dsh-process-console/client` | Registers the tab, owns the process source, the console fold and the dictionaries. |

`cordis.patch.yml` inserts the single row, so the bundle installs standalone.

## The slot

The conversation body renders a ring of view tabs from the `conversation.view` slot, which `ui-conversation` declares. Chat registers at order 0, Trajectory at 10. This package registers `process-console` at 20 with the same call Trajectory uses:

```ts
ctx.slots.inject('conversation.view', () => ctx.slots.register({
  name: 'conversation.view', id: 'process-console', order: 20, locale: NS,
  label: () => t('view.processes'), inject: sessionId => ({ hooks: { process }, select, loadOlder }),
}, ProcessConsoleView))
```

The `inject` waits on the slot's declaration and re-registers after a redeclaration, so plugin order at boot does not matter beyond `dsh.client.inject` naming `ui-conversation`.

## Data path

```text
SessionListState.byId ──buildProcessTree──▶ tree rows (root + parentId closure)
                                                      │ select(id)
ctx.sessions.binding(id).session ──ProcessSource──▶ ConversationSnapshot ──foldConsole──▶ ConsoleLine[]
```

- **Tree.** The host lists subagent sessions with `parentId` set to the delegating session. The tree is the depth-first closure of that relation from the current session. Pure function, tested in isolation.
- **Source.** One `ProcessSource` per conversation, created in the inject factory and kept in a map so the selected child survives a tab switch. It subscribes to exactly one session face at a time and republishes `{ selected, status, conversation }`. It sits in the inject `hooks` compartment; the renderer binds it to the `useProcess` hook.
- **Opening a child window.** `binding()` resolves a face without staging it, and the public `SessionFace` does not declare `open()`. The concrete `Session` does. `ensureOpen` checks for the method at runtime and reports `unavailable` when it is missing, so a harness that removes it produces a visible state instead of a silent blank.
- **Fold.** `foldConsole` flattens `nodes`, `runningCalls`, `partial` and `pending` into lines with a stable key per event or call id. Tool requests and responses share the call id, which is how the view pairs them and computes elapsed time.
- **External delegations.** `streamNodeDefinition` (a `ConversationNodeDefinition`) matches `subagent/stream` events by child id, and `ProcessConsoleViewBuilder` publishes them under the `process-console` view target as `ReadonlyMap<childId, ExternalProcess>`. The tab reads the root's map through `useSession` and the selected child's through the process source, places each child under the session whose log holds it (`withExternals`), and folds the selected child's steps with `foldExternal`. Selecting a delegation is local view state; the session source is not re-targeted. The events themselves come from the harness-side change in [the subagent/stream reference](subagent-stream.md).

## Rendering

Pure presentation over the four props shares. View state is local: filter, follow, raw toggles, per-line expansion. The scroller reserves the floating composer's live height through `--dsh-composer-height`, the same variable Trajectory reads.

## Standalone by construction

Peer dependencies are exact published harness packages. The browser bundle externalizes only `react`; every harness import is type-only and erased at build. Nothing resolves through a checkout of the monorepo.

## Related

- [Security model](security.md)
- [Setup](../howto/setup.md)
- [Implementation plan](../planning/dsh-process-console-implementation-plan.md)
