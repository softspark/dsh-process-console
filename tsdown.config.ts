import { defineConfig } from 'tsdown'

/**
 * Host build: the two Node-importable entries the harness loads before it
 * serves the browser artifact. Neither carries behaviour.
 */
export default defineConfig({
  entry: ['lib/types/index.js', 'lib/types/invariant.js'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
})
