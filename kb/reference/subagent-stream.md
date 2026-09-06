---
title: "The subagent/stream event"
category: reference
service: dsh-process-console
version: "2.0.0"
tags: [dsh, subagent, session-log, event, claude-code, acp, patch]
last_updated: "2026-09-06"
created: "2026-09-05"
description: "The harness-side change that gives one-shot external delegations a live per-process stream: vocabulary, bounds, durability guard, and how it is deployed."
---

# The `subagent/stream` event

## Problem

`dsh-subagent-claude-code` iterates the complete Claude Agent SDK message stream and keeps only the terminal `result`; `dsh-subagent-acp` receives every `session/update` and keeps only the accumulated assistant text. The parent log therefore holds one `tool/call` and one `tool/result` per delegation, and no UI can show what the child did.

## Change

Four packages on `0.1.1-rc.2`, all in the harness monorepo:

| Package | Change |
|---|---|
| `dsh-session` (core) | `Session.append(type, data, { ignorable: true })` for log-only events. The envelope marker existed for readers; no producer could set it. |
| `dsh-subagent` | Declares `'subagent/stream'` in `SessionEventMap`; `createSubagentStreamSink(parentSession, childId, provider)` bounds and appends; `coalesceSubagentStream` merges chunk runs. |
| `dsh-subagent-claude-code` | `ClaudeCodeRunSpec.onStream`; `mapClaudeMessage` translates `system/init`, assistant blocks (text, thinking, tool_use), tool results, `result` and permission denials. The provider wires the sink. |
| `dsh-subagent-acp` | `AcpRunSpec.onStream`; `mapAcpUpdate` translates message and thought chunks, `tool_call`, settled `tool_call_update`, `plan`. Chunks coalesce; the provider wires the sink. |

## Event

```ts
'subagent/stream': {
  childId: SessionId      // the run's SubagentRun.id
  provider: string        // provider registry name
  index: number           // zero-based per child
  item: {
    kind: 'system' | 'assistant' | 'thought' | 'tool-call' | 'tool-result' | 'result' | 'plan' | 'other'
    text?: string; name?: string; callId?: string; isError?: boolean; meta?: JsonValue
  }
  truncated?: true
}
```

Log-only, appended with `{ ignorable: true }`. It never enters model history.

## Bounds

- `text` is cut at 16 KiB UTF-8 on a character boundary and the event is marked `truncated`.
- `meta` above 2 KiB serialized is dropped and the event is marked `truncated`.
- ACP text chunks merge until the kind changes, a non-text update arrives, 1024 characters accumulate, or the prompt settles.
- An append failure is reported once to the host log and silences the sink for that run. The run's result is never affected.

## Durability guard

A harness that does not know an event type refuses to load the log unless the event carries `ignorable: true` (`session-persistence` `assertEventsSupported`). Every `subagent/stream` event carries it, so a session written by a patched harness still opens on a stock one; the stream is simply skipped. This is why the core change is required and why it is limited to the option.

## Deployment in dsh-drydock

`patches/dsh-0.1.1-rc.2/` in this repository holds two forms of the change:

| File | Applies to | Use |
|---|---|---|
| `source.patch` | the harness monorepo at `0.1.1-rc.2` | the upstream pull request; `git apply` in a checkout, then `tsc -b` and `tsdown --env.DSH_BUILD_FACE host` for the four packages. |
| `<package>.lib.patch` | the published package's `lib/index.js` | image build: `patch -p1 -d <package dir> < <package>.lib.patch`. |

Where the packages live in the drydock image:

| Package | Directory |
|---|---|
| `dsh-session`, `dsh-subagent` | `/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/<package>` (the global CLI install; root-owned) |
| `dsh-subagent-claude-code`, `dsh-subagent-acp` | `$DSH_STAGE/profiles/web/node_modules/@deepseek-ai/<package>` (the staged profile) |

dsh-drydock `1.27.0` applies the set: the core packages at image build, the providers at build and again on every boot (`docker/apply-harness-patches.sh`, keyed by `DSH_VERSION`, refusing a package at another version). Its [ADR-006](https://github.com/softspark/dsh-drydock/blob/main/kb/decisions/adr-006-harness-stream-patches.md) records the decision.

## Upstream status

`deepseek-ai/deepseek-harness` does not accept external pull requests at this stage and has issues disabled (its `CONTRIBUTING.md` points at GitHub Discussions). The change is offered as a design proposal in an upstream Discussion, drafted in [upstream-proposal.md](upstream-proposal.md); until a pinned release carries an equivalent, a harness pin bump means regenerating the `lib.patch` files from `source.patch` on the new tag.

`source.patch` also carries the checkout's pending `inheritSessionPermissions` change to `dsh-subagent-claude-code`, which predates this work and is needed for the patched `index.ts` to compile.

## Tests

- `packages/core/session/tests/append-ignorable.spec.ts`
- `packages/subagent/subagent/tests/stream.spec.ts`
- `packages/subagent/subagent-claude-code/tests/stream.spec.ts`
- `packages/subagent/subagent-acp/tests/stream.spec.ts` (real mock ACP server)

## Related

- [Architecture](architecture.md)
- [Implementation plan](../planning/dsh-process-console-implementation-plan.md)
