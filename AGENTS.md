# dsh-process-console Project Instructions

## Purpose

A browser-only DeepSeek Harness bundle: a Processes tab next to Chat and Trajectory that shows every agent and subagent of a conversation as a live console, with each tool request paired to its response. It reads the session windows the harness already streams to the page and writes nothing back.

## Invariants

- Start every public SoftSpark module at version `1.0.0`; never tag or publish a `0.x` release.
- Keep every `@deepseek-ai/*` peer exact until a reviewed compatibility update; the slot contract is tested against one harness version.
- The browser bundle externalizes React plus the two reviewed public client entries in ADR-003: Session Controller and Conversation. `build-client.mjs` rejects every other bare value import. All other harness imports stay type-only.
- Read data through the public object layer and framework hooks. Catalog-only child readers use the authorized Session journal stream and public Conversation assembler. No private event registration, private implementation imports, or `ctx` in components.
- The tab is read-only: never call `prompt`, `cancel`, `rename`, `command` or `updateQueue` on a session.
- `open()` on a child window is duck-typed; a face without it renders an explicit unavailable state, never a blank pane.
- No lifecycle scripts, no host half, no Remote. Adding either is a new security surface and needs an ADR first.
- `patches/` is a reference for the harness-side `subagent/stream` change and never ships in the npm tarball.
- Never hand-edit generated `.claude/`, `.codex/` or `.agents/` files; regenerate them with ai-toolkit.

## Verification

`pnpm run verify` is the gate: required files, version surfaces, licence digest, manifest, KB frontmatter, bundle configuration, lint, typecheck, tests. `pnpm run test:coverage` reports coverage; keep it above 70 percent overall. Tests are network-free and install nothing.

## Reviews and releases

Conventional Commits, no AI co-authorship trailers, strict review. Follow `kb/procedures/`: pre-commit gate, release (tag `v<version>`, npm provenance from a public repository), post-release verification against the registry artefact.
