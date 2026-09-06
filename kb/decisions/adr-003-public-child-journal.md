---
title: "ADR-003: Read catalog children through the public Session journal"
category: decisions
service: dsh-process-console
version: "2.0.0"
tags: [architecture, dsh, subagent, read-only]
created: "2026-09-06"
last_updated: "2026-09-06"
description: "Read child histories independently of global Chat navigation using the authorized gateway and public assembler."
---

# ADR-003: Read catalog children through the public Session journal

## Context

DSH 0.1.2 separates Session lifecycle from Conversation targets. A child may exist only in its parent's durable catalog, so the Session Controller has no ordinary binding for it. Navigating to that child would change Chat and violate the Processes tab's behavior.

## Decision

For a catalog-owned child, prefer an independent `SessionEventStream` addressed by the actual parent id, child id, and mode returned by that catalog, even when an ordinary binding exists. The gateway rejects ordinary addresses for subagent sessions. Other sessions retain their controller bindings. Feed accepted window changes into the public `ConversationNodeAssembler`, activating Trajectory and process-console targets.

The reader exposes lifecycle snapshots, history paging, and disposal only. It cannot prompt, cancel, rename, change queues, or navigate sessions. Replacing the selection disposes the owned stream; stale asynchronous callbacks cannot republish after disposal.

The browser build permits value imports only from React, `@deepseek-ai/dsh-api-session-controller/client`, and `@deepseek-ai/dsh-client-ui-conversation/client`. DSH's module loader supplies those exports. All other harness imports remain type-only, and the build rejects additional bare imports.

## Alternatives

- Show an unavailable pane for every catalog-only child: incomplete functionality.
- Navigate the global Session Controller to materialize the child: changes Chat selection.
- Add a host Remote or import private controller implementation files: unnecessary additional API surface and dependence on internals.

## Verification

Reader tests cover window replacement, append, paging, errors, and disposal. The release browser smoke must select a real child, show its own console, and confirm Chat remains on the parent.
