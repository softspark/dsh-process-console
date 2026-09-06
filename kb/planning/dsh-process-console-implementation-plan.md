---
title: "dsh-process-console Implementation Plan"
category: planning
service: dsh-process-console
tags: [plan, dsh, plugin, console, subagent, observability]
last_updated: "2026-09-05"
created: "2026-09-05"
description: "Plan, success criteria and pre-mortem for the Processes tab: a live per-process console next to Chat and Trajectory."
---

# dsh-process-console Implementation Plan

## Goal

Add a third tab, **Processes**, next to Chat and Trajectory in the DeepSeek Harness
web UI. The tab lists every process of the current conversation (the main agent and
each session-backed subagent, recursively) and shows the selected process as a live,
terminal-like stream: what the agent wrote, every tool request with its raw
arguments, every tool response with its full content, timing, model, errors and
pending approvals. The parent's own log already contains the request and final
answer of one-shot external delegations (Claude Code, Copilot), so those appear
inline as ordinary tool lines.

## Non-goals (this release)

- Token-level streams of one-shot external providers (`subagent_claude_code`,
  `subagent_gemini_copilot`). Their providers return only the final result to the
  parent log; exposing the child stream is a harness-side change.
- Writing anything back to a session. The tab is read-only.
- A patched or forked harness. The bundle installs on the published `0.1.1-rc.2`.

## Design

| Concern | Decision |
|---|---|
| Distribution | One npm bundle, `@softspark/dsh-process-console`, browser half only. Same shape as `dsh-file-preview`. |
| Tab registration | `ctx.slots.register({ name: 'conversation.view', id: 'process-console', order: 20 }, View)`, exactly how Trajectory registers. |
| Process tree | Pure fold over `SessionListState.byId`: the current session is the root, sessions whose `parentId` chains to it are children. |
| Child streams | `ctx.sessions.binding(childId).session` is the child's `ObservableSnapshot<ConversationSnapshot>`. A cold window is opened through the concrete session's `open()`, detected at runtime and refused loudly when absent. |
| Live data | `ConversationSnapshot.nodes`, `partial`, `runningCalls`, `pending`: the public object layer. No private event registration. |
| Reactive channel | One package-owned observable (`ProcessSource`) in the inject `hooks` compartment; the component reads it through the renderer-bound `useProcess` hook. |
| Rendering | Monospaced line list with a kind gutter, timestamps, follow-tail, filter, raw JSON expand, load-older. Tokens only. |

## Success criteria

1. `pnpm run verify` passes: required files, config, typecheck, tests, lint.
2. Installed with `dsh plugin --profile web add`, the tab appears after Trajectory
   without any change to the harness checkout.
3. Selecting a child process shows its own stream; the tab never navigates the
   Chat away from the parent.
4. A tool line shows the request arguments and the full response content of the
   same call, paired by call id, with the elapsed time between them.
5. New events append while the session runs; the view follows the tail until the
   user scrolls up.

## Pre-mortem

| Risk | Signal | Mitigation |
|---|---|---|
| Child window never opens because `open()` is not part of `SessionFace` | Pane stays in `cold` state | Duck-type `open` at runtime; render an explicit "window unavailable" state instead of an empty pane. |
| Module table lacks a value import we rely on | Blank tab, `module not found` at factory time | Value imports limited to React and `ui-primitives` (baseline externals); everything else type-only. |
| Typecheck pulls the whole `ui-conversation` peer graph | `tsc` cannot resolve peers | `skipLibCheck` plus the direct peers as dev dependencies; the SlotMap merge is the only thing needed. |
| Large responses freeze the list | Jank on long sessions | Lines are collapsed by default above a size threshold; expansion is per line. |
| Harness renames `conversation.view` | Tab silently missing | `validate-config` and a mount test pin the slot name; the failure is visible in CI before it is visible to a user. |

## Phase 2: external delegations (done 2026-09-05, unreleased)

Implemented as the `subagent/stream` event: four small changes on the published
`0.1.1-rc.2` harness packages (see [the reference](../reference/subagent-stream.md))
plus a conversation Definition and view target in this package. Verified live in
dsh-drydock: a Claude Code delegation appears as a nested `delegation` row with
its own console showing the child's init, tool calls and results (including MCP
responses), text, reasoning and final result.

Open items:

- Upstream adoption. The harness accepts neither external pull requests nor
  issues yet, so the change is proposed in a GitHub Discussion
  (`kb/reference/upstream-proposal.md`) with `source.patch` linked.
  dsh-drydock `1.27.0` applies the set at image build and re-checks the
  providers on every boot; a harness pin bump regenerates the set.
- A per-process "Open in Chat" action using `ctx.sessions.openSubagent` for
  session-backed children.

## Related

- [Architecture](../reference/architecture.md)
- [Setup](../howto/setup.md)
