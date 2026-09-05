import { defineConfig } from 'vitest/config'

export default defineConfig({
  // The published harness packages ship `//# sourceMappingURL` comments without
  // the maps themselves; reading them is both impossible and pointless here.
  css: { devSourcemap: false },
  esbuild: { sourcemap: false, jsx: 'automatic' },
  test: {
    include: ['tests/**/*.spec.{ts,tsx}'],
    environmentMatchGlobs: [['tests/**/*.client.spec.{ts,tsx}', 'jsdom']],
    // The modal and the harness primitives it borrows both ship CSS modules.
    // Node cannot import `.css`, so these dependencies are transformed by Vite
    // instead of being externalized.
    server: { deps: { inline: [/@deepseek-ai\//u] } },
    css: { modules: { classNameStrategy: 'non-scoped' } },
  },
})
