# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| 2.x | Yes, DSH 0.1.2-rc.1 |
| 1.0.0 | Historical DSH 0.1.1-rc.2 release |

## Reporting a vulnerability

Email **biuro@softspark.eu** with the subject `dsh-process-console security`. Do not open a public issue for a suspected vulnerability. You will receive an acknowledgement within 48 hours and a resolution plan within fourteen days.

## Security design

This package is a browser-only DeepSeek Harness plugin. It adds no host service, no Remote and no tool, and it reads only session windows the harness already streams to the page; a session the page cannot open is not readable through the tab either. It never prompts, cancels, renames or commands a session. The threat model and the reasoning behind each decision are in [`kb/reference/security.md`](kb/reference/security.md).

## Scope

In scope: the browser bundle, the build that produces it, and the patch set under `patches/` that this repository publishes as a reference. Reports about the harness itself belong to the [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) project.

## Hardening posture

- No install-time lifecycle scripts; `ignore-scripts` is set for both consumers and this repository.
- Exact harness peer versions.
- The browser build permits React and the two public client constructor modules documented in ADR-003; other harness imports are type-only. Child journal addresses come from actual catalogs and are authorized by the existing gateway.
- CI runs the source audit, the permission audit and the dependency audit on every push.
