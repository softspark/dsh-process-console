import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

describe('source audit browser coverage', () => {
  it.each(['tsx', 'jsx'])('rejects unsafe code in a .%s component and locates it in SARIF', async extension => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-audit-test-'))
    try {
      await mkdir(join(root, 'scripts'))
      await mkdir(join(root, 'src'))
      await copyFile(new URL('../package.json', import.meta.url), join(root, 'package.json'))
      await copyFile(new URL('../scripts/audit.mjs', import.meta.url), join(root, 'scripts/audit.mjs'))
      await copyFile(new URL('fixtures/unsafe-component.txt', import.meta.url), join(root, `src/unsafe.${extension}`))
      // Execute only the reviewed scanner. The unsafe component stays data.
      const result = spawnSync(process.execPath, [join(root, 'scripts/audit.mjs'), '--sarif'], { encoding: 'utf8', timeout: 10000 })
      expect(result.status).toBe(1)
      expect(result.error).toBeUndefined()
      expect(result.stderr).toBe('')
      const report = JSON.parse(result.stdout)
      expect(report.version).toBe('2.1.0')
      expect(report.runs[0].results).toEqual(expect.arrayContaining([
        expect.objectContaining({ level: 'error', locations: [expect.objectContaining({
          physicalLocation: expect.objectContaining({ artifactLocation: { uri: `src/unsafe.${extension}` } }),
        })] }),
      ]))
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
