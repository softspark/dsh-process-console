// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/dsh-process-console

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Apache-2.0 §4 travels with the artefact, and a public repository without a
// reporting channel or a code of conduct is not publishable.
const required = [
  'LICENSE', 'NOTICE', 'README.md', 'CHANGELOG.md', 'SECURITY.md',
  'CODE_OF_CONDUCT.md', 'cordis.patch.yml', '.npmrc', '.npmignore',
  'scripts/audit.mjs', 'scripts/lint.mjs', 'scripts/validate-kb.mjs', 'scripts/validate-license.mjs',
  'scripts/validate-package.mjs', 'scripts/validate-config.mjs',
  'scripts/verify-version-sync.mjs',
  'scripts/verify-artifacts.mjs',
  '.github/CODEOWNERS', '.github/FUNDING.yml', '.github/dependabot.yml',
  '.github/CONTRIBUTING.md', '.github/PULL_REQUEST_TEMPLATE.md',
  '.github/ISSUE_TEMPLATE/bug_report.md',
  '.github/ISSUE_TEMPLATE/feature_request.md',
  '.github/ISSUE_TEMPLATE/config.yml',
  '.github/workflows/ci.yml', '.github/workflows/publish.yml',
  'kb/procedures/sop-release.md',
  'kb/procedures/sop-pre-commit.md',
  'kb/procedures/sop-post-release-testing.md',
  'kb/reference/architecture.md',
  'kb/reference/security.md',
  'kb/howto/setup.md',
];

const missing = required.filter((path) => !existsSync(resolve(root, path)));
if (missing.length > 0) {
  console.error(`Missing required files:\n  ${missing.join('\n  ')}`);
  process.exitCode = 1;
} else {
  console.log(`Required files present (${required.length} checked)`);
}
