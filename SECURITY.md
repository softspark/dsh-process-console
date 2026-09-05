# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| 0.1.x | Yes |

## Reporting a vulnerability

Email **biuro@softspark.eu** with the subject `dsh-process-console security`. Do not open a public issue for a suspected vulnerability. You will receive an acknowledgement within three working days and a resolution plan within fourteen.

## Scope

This package is a browser-only DeepSeek Harness plugin. It adds no host service, no Remote and no tool, and it reads only session windows the harness already streams to the page. The threat model and the reasoning behind each decision are in [`kb/reference/security.md`](kb/reference/security.md).

Reports about the harness itself belong to the [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) project.

## Hardening posture

- No install-time lifecycle scripts; `ignore-scripts` is set for both consumers and this repository.
- Exact harness peer versions.
- The browser bundle externalizes only `react`; every harness import is type-only.
- CI runs the source audit, the permission audit and the dependency audit on every push.
