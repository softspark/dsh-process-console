import { describe, expect, it } from 'vitest'
import { externalLabel, externalRaw, foldExternal } from '../src/client/external-lines.ts'
import type { ExternalProcess, ExternalStep } from '../src/client/stream-definition.ts'

const step = (partial: Partial<ExternalStep> & Pick<ExternalStep, 'index' | 'kind' | 'time'>): ExternalStep => ({
  seq: partial.index, text: '', name: undefined, callId: undefined, isError: false, meta: undefined, truncated: false, ...partial,
})

const child: ExternalProcess = {
  childId: 'abcdef12-3456', provider: 'claude-code', firstSeq: 1, firstTime: 100, lastTime: 900, done: true,
  steps: [
    step({ index: 0, kind: 'system', time: 100, text: 'claude-code 2.1 · m · cwd /w · 3 tools', meta: { model: 'm', claudeCodeVersion: '2.1' } }),
    step({ index: 1, kind: 'thought', time: 200, text: 'plan' }),
    step({ index: 2, kind: 'assistant', time: 250, text: 'Running ls.' }),
    step({ index: 3, kind: 'tool-call', time: 300, name: 'Bash', callId: 't1', text: '{"command":"ls"}', meta: { status: 'pending', toolKind: null } }),
    step({ index: 4, kind: 'tool-result', time: 750, callId: 't1', text: 'a.txt', truncated: true }),
    step({ index: 5, kind: 'tool-result', time: 760, callId: 'orphan', text: 'x', isError: true }),
    step({ index: 6, kind: 'plan', time: 800, text: '- [done] read' }),
    step({ index: 7, kind: 'result', time: 900, text: 'DONE', meta: { subtype: 'success', durationMs: 800, costUsd: null } }),
    step({ index: 8, kind: 'other', time: 950, text: 'echo' }),
  ],
}

describe('foldExternal', () => {
  it('prints steps as console lines with call pairing, elapsed time and metadata facts', () => {
    const lines = foldExternal(child)
    expect(lines.map(line => [line.kind, line.title, line.detail])).toEqual([
      ['system', 'system', 'model m · claudeCodeVersion 2.1'],
      ['reasoning', '', ''],
      ['assistant', '', ''],
      ['request', 'Bash', 'call t1 · status pending'],
      ['response', '', 'call t1 · 450 ms · truncated'],
      ['response', '', 'call orphan'],
      ['system', 'plan', ''],
      ['system', 'result', 'subtype success · durationMs 800'],
      ['system', '', ''],
    ])
    expect(lines[3]?.text).toBe('{\n  "command": "ls"\n}')
    expect(lines.map(line => line.key)).toEqual(child.steps.map(item => `x:abcdef12-3456:${item.index}`))
    expect(lines.every(line => line.time !== null)).toBe(true)
  })

  it('flags a failed result as an error line', () => {
    const failed: ExternalProcess = {
      ...child,
      steps: [step({ index: 0, kind: 'result', time: 1, text: 'max turns', isError: true, meta: { subtype: 'error_max_turns' } })],
    }
    expect(foldExternal(failed)[0]).toMatchObject({ kind: 'error', isError: true, title: 'result' })
  })

  it('labels and serializes a child', () => {
    expect(externalLabel(child)).toBe('claude-code · abcdef12')
    expect(JSON.parse(externalRaw(child))).toMatchObject({ childId: 'abcdef12-3456', done: true })
  })
})
