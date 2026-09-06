---
title: "Upstream proposal: a per-child stream for out-of-process subagents"
category: reference
service: dsh-process-console
tags: [upstream, deepseek-harness, proposal, subagent, discussion]
last_updated: "2026-09-06"
created: "2026-09-06"
description: "The text proposed to deepseek-ai/deepseek-harness in a GitHub Discussion: why one-shot external children are invisible, the four-package change that fixes it, its bounds and durability guard, and the reference implementation."
---

# Upstream proposal: a per-child stream for out-of-process subagents

Posted to GitHub Discussions of `deepseek-ai/deepseek-harness` (the repository
takes neither external pull requests nor issues). Title and body below.

## Title

Proposal: let out-of-process subagent providers stream the child's steps into the parent log (`subagent/stream`, producer-side `ignorable`)

## Body

**Problem.** A one-shot out-of-process child (`dsh-subagent-claude-code`,
`dsh-subagent-acp`) has no session in the parent's corpus. Both providers
consume the child's complete stream and keep only the final answer: the Claude
provider iterates every Agent SDK message and reads `result`, the ACP provider
receives every `session/update` and folds only `agent_message_chunk`. The
parent log therefore holds one `tool/call` and one `tool/result` per
delegation. No UI can show what the child did, which tools it ran, what it
read, or where a slow delegation is spending its time. The subagent README
already names this: "ACP children remain one-shot and are not trace-enumerable".

**Proposal.** Four small changes on `0.1.1-rc.2`, kept in the shape the
codebase already uses for log-only records:

1. `dsh-session`: `Session.append(type, data, { ignorable: true })` for
   non-surface events. The envelope marker exists and `session-persistence`
   honours it on read, but no producer can set it today, so a plugin cannot
   add a vocabulary that older readers skip instead of refusing the log.
2. `dsh-subagent`: a `subagent/stream` event owned by the Service Definition
   next to `subagent/descriptor`, appended to the delegating parent's log:
   `{ childId, provider, index, item: { kind, text?, name?, callId?, isError?, meta? }, truncated? }`,
   with `kind` in `system | assistant | thought | tool-call | tool-result | result | plan | other`.
   `createSubagentStreamSink(parentSession, childId, provider)` bounds text
   (16 KiB, UTF-8 boundary) and metadata (2 KiB), reports the first append
   failure and then stays silent; `coalesceSubagentStream` merges chunk runs
   for chunked protocols. A parent without an appendable session yields a
   no-op sink.
3. `dsh-subagent-claude-code`: `ClaudeCodeRunSpec.onStream(item, childId)`;
   `mapClaudeMessage` translates `system/init`, assistant blocks (text,
   thinking, tool_use), tool results, `permission_denied` and `result`.
4. `dsh-subagent-acp`: `AcpRunSpec.onStream`; `mapAcpUpdate` translates
   message and thought chunks, `tool_call`, settled `tool_call_update` and
   `plan`.

The run result is unchanged in every case. The events are log-only, never
enter model history, and carry `ignorable: true`, so a log written by a patched
harness opens unchanged on a stock one.

**What it enables.** A browser plugin folds the events into one record per
child through the ordinary conversation Definition and view-target machinery,
and shows each delegation as a nested process with its own live console. This
is running in production behind `@softspark/dsh-process-console` (npm, MIT
harness + Apache-2.0 plugin); a Claude Code child's `ls`, its own MCP call and
its result were visible while it ran.

**Alternatives considered.** Session-backed external children would be the
complete answer and would let the existing catalog, Trajectory and any tab work
unchanged; it is a much larger change touching the continuation manager, host
frames and the client runtime. Reusing `tool/code-dispatch` is semantically a
sub-dispatch of the parent's own call and cannot carry the child's assistant
text. A side channel outside the log has no durability or replay.

**Reference implementation.** Source patch against `dsh-v0.1.1-rc.2`, applies
cleanly, with tests for the sink, the coalescer, both mappers (the ACP one
against the repository's mock ACP server) and the `ignorable` option:
<https://github.com/softspark/dsh-process-console/tree/main/patches/dsh-0.1.1-rc.2>.
Not run against the repository's full per-file coverage and doc-sync gates, so
it is offered as a design reference rather than a drop-in.

Happy to adjust the vocabulary or the placement if the team prefers a
different shape; the two facts I would argue for are the producer-side
`ignorable` option and per-event bounds.

## Related

- [The subagent/stream event](subagent-stream.md)
