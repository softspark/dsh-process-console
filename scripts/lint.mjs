// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/dsh-process-console

/**
 * Syntax-check every script in this directory.
 *
 * `node --check scripts/*.mjs` reads correctly and works on any POSIX shell,
 * but PowerShell does not expand globs, so on Windows node receives the
 * literal pattern and fails with `Cannot find module scripts\*.mjs`. The
 * expansion happens here instead, where every platform agrees.
 */

import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const scripts = readdirSync(here).filter((name) => name.endsWith('.mjs')).sort();

for (const name of scripts) {
  execFileSync(process.execPath, ['--check', resolve(here, name)], { stdio: 'inherit' });
}

console.log(`${scripts.length} script(s) parse`);
