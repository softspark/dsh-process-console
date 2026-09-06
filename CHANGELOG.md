# Changelog

All notable changes to `@softspark/dsh-process-console` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [2.0.0] - 2026-09-06

### Changed

- Require DSH `0.1.2-rc.1`; aggregate Session lifecycle, Conversation targets, Trajectory records, and pending interactions through public services.
- Include catalog-only children and unreadable catalog entries in the process tree.
- Enforce 70% statement, branch, function, and line coverage during verification, CI, and publishing.

### Fixed

- Opt into DSH's native composer-overlay layout so resize handles cannot cover process rows and the console keeps its bounded scroll area.

- Dispose replaced subscriptions and reject stale pagination completion after switching processes.
- Emit advertised browser declarations, validate all exported artifacts, and remove the unpublished source wildcard export.
- Version KB metadata and distinguish partial historical registry checks from complete post-release verification.
- The browser bundle no longer embeds the build machine's absolute repository path in its CSS-module region labels.

### Added

- `AGENTS.md`, `llms.txt`, ADR-001 (standalone browser bundle) and ADR-002 (the `subagent/stream` event), an Update section in the README, and `@vitest/coverage-v8` so `pnpm run test:coverage` runs.

## [1.0.0] - 2026-09-06

### Added

- Processes tab in the DeepSeek Harness conversation view ring, after Chat and Trajectory, shipped as one browser-only profile bundle on the published harness `0.1.1-rc.2`.
- Process tree: the current session as `main` and every session-backed subagent under it, nested by delegation depth, with a running or idle marker.
- Live console per process: user, context and steering input, assistant text and reasoning, tool requests with raw arguments, tool responses with full content and elapsed time paired by call id, running calls, streaming text, pending interactions, retries, compaction, commands and turn errors. MCP tools appear as ordinary tool lines.
- Substring filter, follow-tail, raw JSON per line or for all lines, copy, load older history, long bodies collapsed at 30 rows.
- External delegations as processes. When the harness records `subagent/stream` events, each one-shot Claude Code or ACP child appears as a nested `delegation` row with its own console: init, text, reasoning, tool calls with arguments, tool results with elapsed time, final result. The fold registers a conversation Definition and the `process-console` view target; an unpatched harness contributes nothing and the tab still works.
- `patches/dsh-0.1.1-rc.2/`: the harness-side change as a monorepo source patch and one `lib` patch per published package (`dsh-session`, `dsh-subagent`, `dsh-subagent-claude-code`, `dsh-subagent-acp`), pending an upstream pull request.
- English and Chinese dictionaries.

[1.0.0]: https://github.com/softspark/dsh-process-console/releases/tag/v1.0.0
