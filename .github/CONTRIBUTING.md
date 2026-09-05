# Contributing

## Workflow

1. Branch from `main`: `feat/<topic>`, `fix/<topic>`, or `docs/<topic>`.
2. Run `pnpm run verify` before every commit. It is the gate; CI runs the same thing.
3. Open a pull request. CI must be green on Linux, macOS and Windows.

## Commits

Conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`.

## Coding standards

- TypeScript, strict, with `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`.
- Standard TC39 decorators. `experimentalDecorators` breaks the Remote face.
- A comment explains why, not what.

## Security-relevant changes

Anything touching authorization, the sanitizer, or the size bounds needs a test that fails without the change, plus a matching update to `SECURITY.md`.
