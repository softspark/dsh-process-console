# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- External delegations as processes. When the harness records `subagent/stream` events (a patched `dsh-subagent-claude-code` or `dsh-subagent-acp` provider appending the child's steps to the parent log), each one-shot Claude Code or ACP child appears as a nested row under its parent with its own live console: the child's text and reasoning, every tool call with arguments, every tool result with elapsed time, and the final result. The fold registers a conversation Definition and the `process-console` view target; an unpatched harness contributes nothing and the tab behaves as in 0.1.0.

## [0.1.0] - 2026-09-05

### Added

- Processes tab in the DeepSeek Harness conversation view ring, after Chat and Trajectory.
- Process tree: the current session and every session-backed subagent under it.
- Live console per process: user, context and steering input, assistant text and reasoning, tool requests with raw arguments, tool responses with full content and elapsed time, running calls, streaming text, pending interactions, retries, compaction, commands and turn errors.
- Substring filter, follow-tail, raw JSON per line or for all lines, copy, load older history.
- English and Chinese dictionaries.

[Unreleased]: https://github.com/softspark/dsh-process-console/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/softspark/dsh-process-console/releases/tag/v0.1.0
