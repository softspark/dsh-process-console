// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/dsh-process-console

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const patch = readFileSync(resolve(root, 'cordis.patch.yml'), 'utf8');
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

// The one row, named by this package alone. A row pointing anywhere else would
// make the bundle depend on a package the install does not carry.
for (const expected of [
  '- id: ui-process-console',
  "      name: '@softspark/dsh-process-console'",
]) {
  if (!patch.includes(expected)) throw new Error(`cordis.patch.yml is missing: ${expected}`);
}

// New rows must be inserted. A bare `- id:` entry patches a row that already
// exists, and DSH answers `patch: entry "ui-process-console" not found`, skips
// it, and leaves a plugin that installs cleanly and does nothing at all.
if (!/^- insert:$/mu.test(patch)) {
  throw new Error('cordis.patch.yml must add its row through `insert:`, not as a bare patch entry');
}

// The browser row must name the package root. DSH imports a row's name on the
// host before it ever reaches the page, and the root is the only entry that is
// both Node-importable and carries the `dsh.client` declaration; naming the
// browser artifact directly makes the harness fail to boot.
if (patch.includes("name: '@softspark/dsh-process-console/client'")) {
  throw new Error('the browser row must name the package root, not the client artifact');
}
if (manifest.dsh?.client === undefined) {
  throw new Error('package.json must declare dsh.client so the harness serves the browser half');
}
// The harness validates this field before it will serve the bundle, and refuses
// to boot the whole profile without it.
if (typeof manifest.dsh.client.platform !== 'string') {
  throw new Error('dsh.client.platform must be a string, e.g. "web"');
}
// The tab registers into a slot that ui-conversation declares; loading before
// that declaration would throw at register time.
for (const required of ['@deepseek-ai/dsh-client-ui-conversation', '@deepseek-ai/dsh-client-locale']) {
  if (!manifest.dsh.client.inject?.includes(required)) {
    throw new Error(`dsh.client.inject must name ${required}`);
  }
}

if (manifest.dsh?.bundle?.patch !== './cordis.patch.yml') {
  throw new Error('package.json must declare the DSH bundle patch');
}

// A lifecycle script would run on every consumer install; the hardening posture
// this package documents depends on there being none.
for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'postpublish']) {
  if (manifest.scripts?.[lifecycle] !== undefined) throw new Error(`lifecycle script forbidden: ${lifecycle}`);
}

// Harness peers must be exact: a range would let a profile resolve a harness
// whose slot contract this package has never been tested against. React is
// deliberately a range — the harness supplies it.
for (const [name, range] of Object.entries(manifest.peerDependencies ?? {})) {
  if (!name.startsWith('@deepseek-ai/')) continue;
  if (/[\^~*]|\s-\s/u.test(range)) throw new Error(`harness peer must be exact: ${name}@${range}`);
}

if (manifest.license !== 'Apache-2.0') throw new Error('license must be Apache-2.0');
if (manifest.private === true) throw new Error('publishable package cannot be private');

console.log('DSH bundle and package configuration valid');
