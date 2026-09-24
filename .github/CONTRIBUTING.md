# Contributing

## Workflow

1. Branch from `main`: `feat/<topic>`, `fix/<topic>`, or `docs/<topic>`.
2. Run `pnpm run verify` before every commit. It is the gate. There is no CI on pushes or pull requests; the maintainer's release script runs the full gate again, on macOS and in a Linux container, before any tag.
3. Open a pull request with the `pnpm run verify` result in the description.

## Commits

Conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`.

## Coding standards

- TypeScript, strict, with `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`.
- Standard TC39 decorators. `experimentalDecorators` breaks the Remote face.
- A comment explains why, not what.

## Security-relevant changes

Anything touching authorization, the sanitizer, or the size bounds needs a test that fails without the change, plus a matching update to `SECURITY.md`.
