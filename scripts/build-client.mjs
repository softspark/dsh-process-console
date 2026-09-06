// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/dsh-process-console

/**
 * Emit the browser artifact in the harness's client-module format.
 *
 * The harness builds its own client bundles with a preset that lives inside its
 * monorepo and is published nowhere, so a standalone plugin cannot reuse it.
 * The format itself is public — every published `client.js` carries it — and it
 * is small: one loader registration whose factory resolves externals through an
 * injected `require`, with CSS modules compiled and injected at factory time.
 *
 * What this file owns, and therefore what can drift if the harness changes it:
 *   - the loader envelope         `window.__ModuleLoader__.load({ id, factory })`
 *   - externals as `require(...)` inside that factory
 *   - the CSS module contract: hashed class map plus a de-duplicated
 *     `<style data-plugin-css="...">` tag
 */

import { createHash } from 'node:crypto'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rolldown } from 'rolldown'
import { transform } from 'lightningcss'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
/** Bare specifiers that must be inlined because the loader does not serve them. */
const BUNDLED_EXTERNALS = []
const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
const PACKAGE = manifest.name
const ENTRY = resolve(root, 'src/client/index.tsx')
const OUTPUT = resolve(root, 'lib/client.js')

/** Stable per-file hash, so a rebuild of unchanged CSS yields unchanged classes. */
function classPrefix(id) {
  return `${createHash('sha256').update(`${PACKAGE}:${basename(id)}`).digest('base64url').slice(0, 6)}_`
}

/**
 * Compile one CSS module into JavaScript: the injector plus the class map.
 *
 * The tag id is namespaced by package so two plugins shipping `Modal.module.css`
 * cannot collide, and the guard makes a second factory run a no-op rather than
 * a duplicated stylesheet.
 */
function cssModuleToJs(id, source) {
  const { code, exports = {} } = transform({
    filename: id,
    code: Buffer.from(source),
    cssModules: { pattern: `${classPrefix(id)}[local]` },
    minify: true,
  })
  const classMap = Object.fromEntries(
    Object.entries(exports).map(([name, value]) => [name, value.name]),
  )
  const tagId = `${PACKAGE}/${basename(id)}`
  return `const css = ${JSON.stringify(code.toString())};
const tagId = ${JSON.stringify(tagId)};
if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
  const tag = document.createElement("style");
  tag.dataset.plugin = ${JSON.stringify(PACKAGE)};
  tag.dataset.pluginCss = tagId;
  tag.textContent = css;
  document.head.appendChild(tag);
}
export default ${JSON.stringify(classMap, null, 2)};
`
}

/**
 * Route `*.module.css` through a virtual id that does not end in `.css`.
 *
 * Rolldown decides "this is a stylesheet" from the extension alone and refuses
 * to bundle CSS at all, so a `load` hook returning JavaScript is never reached
 * for a real `.css` id. The harness's own preset solves it the same way.
 */
const CSS_PREFIX = '\0dsh-css:'
const CSS_SUFFIX = '.mjs'

const cssModules = {
  name: 'dsh-css-modules',
  resolveId(source, importer) {
    if (!source.endsWith('.module.css')) return null
    const absolute = importer === undefined
      ? resolve(root, source)
      : resolve(dirname(importer), source)
    return `${CSS_PREFIX}${absolute}${CSS_SUFFIX}`
  },
  async load(id) {
    if (!id.startsWith(CSS_PREFIX)) return null
    const file = id.slice(CSS_PREFIX.length, -CSS_SUFFIX.length)
    return { code: cssModuleToJs(file, await readFile(file, 'utf8')), moduleSideEffects: true }
  },
}

const bundle = await rolldown({
  input: ENTRY,
  // Only what the harness's module table actually provides may stay external.
  // No published client bundle requires `zod`, so the loader does not serve it
  // and the Remote descriptor's schemas have to travel inside this artifact —
  // an external here would be a module-not-found at factory time.
  external: (source) => {
    if (source.startsWith('.') || source.startsWith('/')) return false
    return !BUNDLED_EXTERNALS.some((name) => source === name || source.startsWith(`${name}/`))
  },
  plugins: [cssModules],
  platform: 'browser',
  resolve: { extensions: ['.tsx', '.ts', '.jsx', '.js'] },
})

const { output } = await bundle.generate({ format: 'cjs', exports: 'named' })
await bundle.close()

const [chunk] = output
if (chunk === undefined) throw new Error('build-client: rolldown produced no chunk')

// The envelope already declares the module marker; rolldown's cjs preamble
// repeats it, and two identical defineProperty calls on a non-configurable
// property is a throw waiting to happen.
const MODULE_MARKER = 'Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });'
// Rolldown labels each CSS-module region with the absolute path it resolved,
// which would put the build machine's directory layout into a published
// artifact. Relative to the repository root is all a reader needs.
const body = chunk.code
  .split('\n')
  .filter((line) => line.trim() !== MODULE_MARKER)
  .join('\n')
  .split(root)
  .join('.')

// The envelope, byte-compatible with what the harness's own bundles emit.
const artifact = `window.__ModuleLoader__.load({
\tid: ${JSON.stringify(PACKAGE + '/client')},
\tfactory: (require) => {
\t\tvar module = { exports: {} };
\t\tvar exports = module.exports;
\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
${body.replace(/^/gmu, '\t\t')}
\t\treturn module.exports;
\t}
});
`

await mkdir(dirname(OUTPUT), { recursive: true })
await writeFile(OUTPUT, artifact, 'utf8')
console.log(`build-client: wrote lib/client.js (${(artifact.length / 1024).toFixed(1)} kB)`)
