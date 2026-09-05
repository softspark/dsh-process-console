# @softspark/dsh-process-console

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![CI](https://github.com/softspark/dsh-process-console/actions/workflows/ci.yml/badge.svg)](https://github.com/softspark/dsh-process-console/actions/workflows/ci.yml)

A **Processes** tab next to Chat and Trajectory in the DeepSeek Harness web UI. It lists every process of the current conversation, the main agent and each subagent under it, and prints the selected one as a live console: what the agent wrote, every tool request with its raw arguments, every tool response with its full content, the model behind each step, timing, errors and pending approvals.

Works on the **published harness**. No patch, no fork, no modified checkout.

## Contents

- [Why](#why)
- [Requirements](#requirements)
- [Install](#install)
- [What you see](#what-you-see)
- [What you do not see yet](#what-you-do-not-see-yet)
- [Documentation](#documentation)

## Why

Chat shows the conversation. Trajectory shows one session's ledger. Neither answers the question "what is each process doing right now, with which exact request and which exact response". When a parent delegates to subagents the picture splits across sessions you have to open one at a time. This tab puts them side by side and keeps following the tail.

## Requirements

- Node.js 22.19.0 or newer
- DeepSeek Harness `0.1.1-rc.2`
- `pnpm` for the profile plugin manager

## Install

```bash
dsh plugin --profile web add @softspark/dsh-process-console --save-exact
```

Restart DSH. The package registers its row itself. For a local checkout:

```bash
pnpm install --ignore-scripts && pnpm run build
dsh plugin --profile web add "$(pwd)"
```

## What you see

| Column | Content |
|---|---|
| Process tree | The current session as `main`, then every session-backed subagent under it, nested by delegation depth, with a running or idle marker. |
| Console | One line per event in log order. `USER`, `CTX`, `STEER`, `THINK`, `ASSIST` (provider/model, turn, step, time to first token, total, tokens), `CALL` (tool name and pretty-printed arguments), `RESULT` (full content, elapsed time since the call, error code), `RUNNING`, `STREAM`, `WAIT`, `SYS`, `ERROR`. |
| Toolbar | Substring filter, load older history, raw JSON for every line, follow-tail toggle. Scrolling up pauses following; the toggle resumes it. |
| Per line | Copy the body, or expand the raw payload of that one line. Long bodies start collapsed at 30 rows. |

Tool calls include MCP tools, since the harness records them as ordinary tool events.

## What you do not see yet

One-shot external delegations (`subagent_claude_code`, `subagent_gemini_copilot`) return only their final answer to the parent log, so they appear as a `CALL` and a `RESULT` in the parent console rather than as a process of their own. Exposing their child stream is a harness-side change, tracked in the [implementation plan](kb/planning/dsh-process-console-implementation-plan.md).

## Documentation

| Document | Purpose |
|---|---|
| [Architecture](kb/reference/architecture.md) | The slot, the data path and why the package is standalone |
| [Security model](kb/reference/security.md) | What the tab can and cannot read |
| [Setup](kb/howto/setup.md) | Install and confirm |
| [Common issues](kb/troubleshooting/common-issues.md) | Why the tab is missing or a pane stays empty |
| [Implementation plan](kb/planning/dsh-process-console-implementation-plan.md) | Scope, success criteria, pre-mortem |

## Contributing

See [CONTRIBUTING.md](.github/CONTRIBUTING.md). `pnpm run verify` is the gate.

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
