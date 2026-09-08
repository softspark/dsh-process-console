# dsh-process-console

> A **Processes** tab for the DeepSeek Harness web UI: every agent and subagent of a conversation as a live console, with the exact request and response of each step.

[![npm](https://img.shields.io/npm/v/@softspark/dsh-process-console.svg)](https://www.npmjs.com/package/@softspark/dsh-process-console)
[![CI](https://github.com/softspark/dsh-process-console/actions/workflows/ci.yml/badge.svg)](https://github.com/softspark/dsh-process-console/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![DSH community plugin](https://img.shields.io/badge/DSH-community%20plugin-4b8bbe.svg)](https://github.com/topics/dsh-plugin)

The tab sits next to Chat and Trajectory. It lists every process of the current conversation, the main agent and each subagent under it, and prints the selected one as a live console: what the agent wrote, every tool request with its raw arguments, every tool response with its full content, the model behind each step, timing, errors and pending approvals.

Works on the **published harness**. No patch, no fork, no modified checkout. This is an independently maintained SoftSpark community integration. It is unofficial and is not affiliated with or endorsed by DeepSeek.

## What's New in v2.0.0

- DSH `0.1.2-rc.1` support through its Session Controller, Conversation, Trajectory, and pending-interaction services.
- Catalog-only children in the process tree and protection against stale pagination after switching processes.
- Enforced 70% coverage and complete browser TypeScript declarations.

Version 2 requires DSH `0.1.2-rc.1`. Keep plugin `1.0.0` when using DSH `0.1.1-rc.2`.

Full history in [CHANGELOG.md](CHANGELOG.md).

## Contents

- [Why](#why)
- [Requirements](#requirements)
- [Install](#install)
- [Update](#update)
- [What you see](#what-you-see)
- [External delegations](#external-delegations)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)
- [Changelog](#changelog)

## Why

Chat shows the conversation. Trajectory shows one session's ledger. Neither answers the question "what is each process doing right now, with which exact request and which exact response". When a parent delegates to subagents the picture splits across sessions you have to open one at a time. This tab puts them side by side and keeps following the tail.

## Requirements

- Node.js 22.19.0 or newer
- DeepSeek Harness `0.1.2-rc.1`
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

## Update

Pins are exact on purpose. Move to a newer release by adding it again, then restart DSH:

```bash
dsh plugin --profile web add @softspark/dsh-process-console@<version> --save-exact
```

`dsh plugin --profile web remove @softspark/dsh-process-console` removes the tab and nothing else.

## What you see

| Column | Content |
|---|---|
| Process tree | The current session as `main`, then every session-backed subagent under it, nested by delegation depth, with a running or idle marker. |
| Console | One line per event in log order. `USER`, `CTX`, `STEER`, `THINK`, `ASSIST` (provider/model, turn, step, time to first token, total, tokens), `CALL` (tool name and pretty-printed arguments), `RESULT` (full content, elapsed time since the call, error code), `RUNNING`, `STREAM`, `WAIT`, `SYS`, `ERROR`. |
| Toolbar | Substring filter, load older history, raw JSON for every line, follow-tail toggle. Scrolling up pauses following; the toggle resumes it. |
| Per line | Copy the body, or expand the raw payload of that one line. Long bodies start collapsed at 30 rows. |

Tool calls include MCP tools, since the harness records them as ordinary tool events.

## External delegations

One-shot external delegations (`subagent_claude_code`, `subagent_gemini_copilot`) have no session of their own, so a stock harness records only their final answer: they appear as a `CALL` and a `RESULT` in the parent console.

With the harness-side change described in [`kb/reference/subagent-stream.md`](kb/reference/subagent-stream.md), the provider appends the child's steps to the parent log as ignorable `subagent/stream` events, and this tab folds them into a nested row per child with its own live console. The change is four small patches on published harness packages (`dsh-session`, `dsh-subagent`, `dsh-subagent-claude-code`, `dsh-subagent-acp`), one reviewed set per harness version under `patches/`, shipped by [dsh-drydock](https://github.com/softspark/dsh-drydock) and proposed upstream in a GitHub Discussion, since the harness takes neither external pull requests nor issues yet. Without it the tab behaves exactly as before.

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

## Security

The tab is read-only and adds no host surface; the model is in [SECURITY.md](SECURITY.md) and [`kb/reference/security.md`](kb/reference/security.md).

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

## Changelog

Every release is recorded in [CHANGELOG.md](CHANGELOG.md).

---

Built by [SoftSpark](https://softspark.eu) for people who want to see what their agents actually do.
