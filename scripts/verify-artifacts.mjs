// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/dsh-process-console

import { existsSync, readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
for (const [subpath, entry] of Object.entries(manifest.exports)) {
  const targets = typeof entry === 'string' ? [entry] : Object.values(entry);
  for (const target of targets) {
    if (typeof target !== 'string' || target.includes('*') || !existsSync(new URL(target, root))) {
      throw new Error(`Missing concrete artifact for ${subpath}: ${String(target)}`);
    }
  }
}
console.log('Every exported JavaScript and declaration artifact exists');
