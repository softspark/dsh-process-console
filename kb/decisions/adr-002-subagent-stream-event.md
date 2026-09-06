---
title: "ADR-002: Delegations stream through an ignorable log-only event in the harness"
category: decisions
service: dsh-process-console
version: "2.0.0"
tags: [adr, dsh, subagent, claude-code, acp, session-log, patch]
last_updated: "2026-09-06"
created: "2026-09-06"
description: "Give one-shot external delegations a per-child stream by patching the harness providers to append bounded, ignorable subagent/stream events to the parent log, rather than a side channel, a reused event, or session-backed children."
---

# ADR-002: Delegations stream through an ignorable log-only event in the harness

## Status

Accepted.

## Context

A one-shot Claude Code or ACP child has no session in the parent's corpus. The harness providers consume the child's complete stream and keep only the final answer, so [ADR-001](adr-001-standalone-browser-bundle.md)'s tab could show a delegation only as the parent's `CALL` and `RESULT`. The harness accepts neither external pull requests nor issues at this stage.

## Decision

Four small patches on the pinned harness, kept in this repository under `patches/` and shipped by dsh-drydock: a producer-side `ignorable` option on `Session.append`, a `subagent/stream` event owned by `dsh-subagent` with a bounded sink and a chunk coalescer, and stream mapping in the Claude Code and ACP providers. The tab folds the events through the harness's own conversation Definition and view-target machinery into one row per child.

Every event is log-only and carries `ignorable: true`, so a log written by a patched harness opens unchanged on a stock one. Text is bounded at 16 KiB per event and metadata at 2 KiB; a sink failure is reported once and never affects the run's result.

## Consequences

- A delegation appears as a nested row with its own console while it runs, including the child's tool calls and their results.
- The parent log grows by the child's steps, bounded per event but not per run.
- The plugin now has two modes: with the patch set, delegation rows; without it, the 1.0.0 behaviour. Both are documented and tested.
- The patch set is tied to one harness version and must be regenerated from `source.patch` on a pin bump. The exit is upstream adoption, proposed in a GitHub Discussion ([upstream-proposal.md](../reference/upstream-proposal.md)).

## Alternatives rejected

- **Session-backed external children**: the complete answer, and far larger; it touches the continuation manager, host frames and client runtime.
- **Reusing `tool/code-dispatch`**: known to every reader, but a sub-dispatch of the parent's own call cannot honestly carry the child's assistant text.
- **A host side channel outside the log**: no durability or replay, and still a provider patch.
- **Claude Code hooks writing a file**: one provider only, ambiguous parent correlation, and the SDK runs the child with `persistSession: false`.
