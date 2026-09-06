---
title: "dsh-process-console Security Model"
category: reference
service: dsh-process-console
version: "2.0.0"
tags: [security, dsh, plugin, client, read-only]
last_updated: "2026-09-06"
created: "2026-09-05"
description: "What the Processes tab can read, what it can never do, and why it adds no new host surface."
---

# dsh-process-console Security Model

## No new host surface

The package ships no host service, no Remote and no tool. The browser half reads session windows the harness already streams to the page for Chat and Trajectory, through the same runtime service. A session the page cannot already open is not readable through this tab either: `ctx.sessions.binding()` returns nothing for a session that is neither host-listed nor addressed.

## Read-only

The tab never calls `prompt`, `cancel`, `rename`, `command` or `updateQueue`. The only session method it invokes besides reading is `loadOlder`, and `open` on a cold window, both of which Chat performs on selection.

## What the console prints

Everything the harness records in the session log for that process: prompts, assistant text and reasoning, tool arguments and results, approvals. If a tool result carries a secret, the secret was already in the log and already visible in Chat's tool card. This tab does not widen what is recorded; it changes how it is displayed.

## Clipboard

Copy uses the browser clipboard API on an explicit click. Nothing is copied automatically.

## Supply chain

- No lifecycle scripts. `installConfig.ignore-scripts` is set and `validate-config` refuses any.
- Exact harness peers. A range would let a profile pair this package with a harness whose slot contract it was never tested against.
- The browser bundle externalizes only `react`. Every harness import is type-only.

## Related

- [Architecture](architecture.md)
- [SECURITY.md](../../SECURITY.md) for reporting
