// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/dsh-process-console

import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

for (const [field, expected] of Object.entries({
  name: '@softspark/dsh-process-console',
  license: 'Apache-2.0',
  type: 'module',
})) {
  if (manifest[field] !== expected) throw new Error(`package ${field} must be ${expected}`);
}
if (!/^\d+\.\d+\.\d+$/u.test(String(manifest.version))) throw new Error('package version must be a release semver');

if (manifest.private === true) throw new Error('publishable package cannot be private');
if (manifest.engines?.node !== '>=22.19.0') throw new Error('Node engine must match the supported DSH baseline');
if (manifest.publishConfig?.access !== 'public') throw new Error('publishConfig.access must be public');

// A lifecycle script runs on every consumer install. The security posture this
// package documents rests on there being none.
for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'postpublish']) {
  if (manifest.scripts?.[lifecycle] !== undefined) throw new Error(`lifecycle script forbidden: ${lifecycle}`);
}

// Apache-2.0 §4 travels with the artefact. npm auto-includes LICENSE but not
// NOTICE, and the bundle patch is what makes the package installable at all.
for (const file of ['cordis.patch.yml', 'LICENSE', 'NOTICE', 'README.md', 'CHANGELOG.md', 'lib/client.js', 'lib/index.js']) {
  if (!manifest.files?.includes(file)) throw new Error(`package files entry missing: ${file}`);
}

// The root row and the browser artifact must be reachable by exact specifiers.
for (const subpath of ['.', './client', './invariant']) {
  if (manifest.exports?.[subpath] === undefined) throw new Error(`package exports entry missing: ${subpath}`);
}

console.log('package manifest valid');
