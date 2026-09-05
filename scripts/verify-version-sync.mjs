// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/dsh-process-console

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async (relativePath) =>
  JSON.parse(await readFile(resolve(root, relativePath), 'utf8'));

const packageJson = await readJson('package.json');
// pnpm's lockfile records no root version, so the surfaces that can disagree
// are the manifest, the changelog heading, and the release tag.
const changelog = await readFile(resolve(root, 'CHANGELOG.md'), 'utf8');
const heading = /^## \[(\d+\.\d+\.\d+)\]/mu.exec(changelog)?.[1];
const versions = new Map([
  ['package.json', packageJson.version],
  ['CHANGELOG.md newest heading', heading],
]);

let failed = false;
for (const [source, version] of versions) {
  if (version !== packageJson.version) {
    console.error(`${source} version ${String(version)} does not match ${packageJson.version}`);
    failed = true;
  }
}

const tagIndex = process.argv.indexOf('--tag');
if (tagIndex >= 0) {
  const tag = process.argv[tagIndex + 1];
  const expectedTag = `v${packageJson.version}`;
  if (tag !== expectedTag) {
    console.error(`Release tag ${String(tag)} does not match ${expectedTag}`);
    failed = true;
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log(`Version surfaces match ${packageJson.version}`);
}
