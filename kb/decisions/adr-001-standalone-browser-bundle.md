---
title: "ADR-001: A standalone browser-only bundle over the public object layer"
category: decisions
service: dsh-process-console
tags: [adr, dsh, plugin, slot, client, architecture]
last_updated: "2026-09-06"
created: "2026-09-06"
description: "Ship the Processes tab as one browser-only profile bundle on the published harness, reading the public conversation snapshot, instead of a harness fork, a host service, or a sidecar log viewer."
---

# ADR-001: A standalone browser-only bundle over the public object layer

## Status

Accepted.

## Context

The goal was a tab next to Chat and Trajectory showing every process of a conversation as a live console. Three shapes were on the table: a sidecar viewer tailing transcripts outside the harness, a change inside the harness monorepo, or a plugin on the published harness. The harness composes its web client from plugins that register into declared slots, and Trajectory itself is such a plugin: it registers one entry in the `conversation.view` ring and reads the shared session window.

## Decision

One npm package, `@softspark/dsh-process-console`, installed as a profile bundle on the published `0.1.1-rc.2`, with a browser half only. It registers into `conversation.view` exactly as Trajectory does and reads data through the public object layer: `ConversationSnapshot` (nodes, running calls, partial text, pending interactions) for the console and `SessionListState` for the process tree. A child window is reached through `ctx.sessions.binding()` and opened through the concrete session's `open()`, detected at runtime.

No host half, no Remote, no new event registration, no value import from a harness package: the bundle externalizes `react` and nothing else.

## Consequences

- Works on an unmodified harness and is removed by removing the bundle.
- The tab is read-only by construction; it cannot widen what the browser may read, because it reads only windows the harness already streams.
- Coupling to the harness is limited to the slot name, the public snapshot types and one undeclared method; each has a visible failure mode (missing tab, type error at build, explicit unavailable state).
- What the public snapshot does not carry, the tab cannot show. That is what made [ADR-002](adr-002-subagent-stream-event.md) necessary.
