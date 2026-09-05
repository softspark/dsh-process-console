---
title: "dsh-process-console Common Issues"
category: troubleshooting
service: dsh-process-console
tags: [troubleshooting, dsh, plugin, slot, subagent]
last_updated: "2026-09-05"
created: "2026-09-05"
description: "Why the Processes tab is missing, why a pane stays empty, and why a delegation has no row of its own."
---

# dsh-process-console Common Issues

## The tab does not appear

**Symptom:** Chat and Trajectory are there, Processes is not.

**Causes and checks:**

1. The bundle is not in the profile layer stack. Run `dsh plugin --profile web list` and confirm `@softspark/dsh-process-console` is present. A path install that was never built has no `lib/client.js`; run `pnpm run build` and restart.
2. The row was patched instead of inserted. The harness logs `patch: entry "ui-process-console" not found` at boot. `pnpm run validate:config` catches this in the repository.
3. The browser console reports `module not found` inside the plugin factory. The bundle requested something the module table does not serve. `lib/client.js` must `require` only `react` and `react/jsx-runtime`.

## A child pane says the process is not reachable

**Symptom:** Selecting a subagent shows "This process is not reachable from the current session".

**Cause:** The runtime has no session binding for that id, or the concrete session no longer exposes `open()`. The first happens when the host has not listed the child yet; wait for the delegation to produce its first durable event and select again. The second is a harness change; the tab refuses to render a blank pane in that case by design.

## A delegation to Claude Code or Copilot has no row

**Symptom:** The parent console shows `CALL subagent_claude_code` and later `RESULT`, but the tree has no child.

**Cause:** One-shot external providers are not session-backed. They return only the final answer to the parent log. The request prompt is in the `CALL` line's arguments and the answer in the `RESULT` line. A per-process stream needs a harness-side change; see the implementation plan.

## The console stops following new lines

**Symptom:** New events arrive but the view stays where it is.

**Cause:** Scrolling up pauses following so an earlier line can be inspected. Press Follow in the toolbar to resume; selecting another process also resumes it.

## Related

- [Setup](../howto/setup.md)
- [Architecture](../reference/architecture.md)
