---
title: "Install dsh-process-console"
category: howto
service: dsh-process-console
tags: [setup, install, dsh, profile, bundle]
last_updated: "2026-09-05"
created: "2026-09-05"
description: "Install the bundle into a DSH profile and confirm the Processes tab appears."
---

# Install dsh-process-console

## Requirements

- Node.js 22.19.0 or newer.
- `pnpm` for the DSH profile plugin manager.
- DeepSeek Harness `0.1.1-rc.2`.

No harness modification is required. The plugin works on the published harness.

## Install from npm

```bash
dsh plugin --profile web add @softspark/dsh-process-console --save-exact
```

## Install from a checkout

```bash
pnpm install --ignore-scripts
pnpm run build
dsh plugin --profile web add "$(pwd)"
```

`dsh plugin` anchors a path spec to the directory it is invoked from and pnpm links it into the profile. Rebuild with `pnpm run build` after a source change; the profile picks up the new `lib/client.js` on the next restart.

Restart DSH and open a session.

## Confirm

1. The conversation header shows three tabs: Chat, Trajectory, Processes.
2. Open Processes. The tree lists `main · <session title>`; the console prints the session's events with `CALL` and `RESULT` lines paired by call id.
3. Ask the agent to delegate to a subagent. A nested row appears under `main`; selecting it shows that child's own console while Chat stays on the parent.

## Remove

```bash
dsh plugin --profile web remove @softspark/dsh-process-console
```

Removing the package removes the tab and nothing else.

## Related

- [Architecture](../reference/architecture.md)
- [Common issues](../troubleshooting/common-issues.md)
