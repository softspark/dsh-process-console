import { describe, expect, it } from 'vitest'
import type { ConversationNode } from '@deepseek-ai/dsh-client-ui-conversation/client'
import {
  contentText, foldConsole, isLong, LONG_LINE_ROWS, prettyArguments, safeJson, type ConsoleInput,
} from '../src/client/console-lines.ts'

const node = <T extends ConversationNode>(value: T): T => value

function input(partial: Partial<ConsoleInput>): ConsoleInput {
  return { nodes: [], partial: null, runningCalls: [], pending: [], ...partial }
}

describe('foldConsole', () => {
  it('prints a turn as user, model header, tool request, tool response', () => {
    const nodes: ConversationNode[] = [
      node({ kind: 'user', seq: 1, time: 1000, source: 'human', content: [{ type: 'text', text: 'list files' }] }),
      node({
        kind: 'assistant', seq: 2, time: 2000, turn: 1, step: 1,
        blocks: [
          { kind: 'reasoning', text: 'I should run ls' },
          { kind: 'text', text: 'Running ls.' },
          { kind: 'tool-call', callId: 'c1', name: 'bash', argsRaw: '{"command":"ls"}' },
        ],
        requestConfig: { provider: 'deepseek', model: 'v4', thinking: 'on' },
        usage: { inputTokens: 120, outputTokens: 30, cacheReadTokens: 100 },
        timing: { stepStartTime: 1500, firstTokenTime: 1700, completedTime: 2000 },
      } as ConversationNode),
      node({
        kind: 'tool-result', seq: 3, time: 2600, callId: 'c1', call: { name: 'bash', argsRaw: '{"command":"ls"}' },
        callTime: 2000, content: [{ type: 'text', text: 'a.txt\nb.txt' }], isError: false,
        callView: null, resultView: null, subCalls: [],
      } as ConversationNode),
    ]

    const lines = foldConsole(input({ nodes }))

    expect(lines.map(line => line.kind)).toEqual(['user', 'reasoning', 'assistant', 'request', 'response'])
    expect(lines[0]).toMatchObject({ text: 'list files', time: 1000 })
    expect(lines[2]).toMatchObject({
      title: 'deepseek/v4 (thinking=on)',
      detail: 'turn 1 · step 1 · ttft 200 ms · total 500 ms · in 120 · cached 100 · out 30',
    })
    expect(lines[3]).toMatchObject({ key: 'req:c1', title: 'bash', text: '{\n  "command": "ls"\n}', detail: 'call c1' })
    expect(lines[4]).toMatchObject({ key: 'res:c1', title: 'bash', text: 'a.txt\nb.txt', detail: 'call c1 · 600 ms', isError: false })
  })

  it('marks failures, flattens sub-calls and appends live state last', () => {
    const nodes: ConversationNode[] = [
      node({
        kind: 'tool-result', seq: 5, time: 5000, callId: 'p', call: { name: 'run_code', argsRaw: '{}' },
        callTime: 4000, content: [{ type: 'text', text: 'boom' }], isError: true,
        error: { name: 'ToolError', code: 'E_FAIL' }, callView: null, resultView: null,
        subCalls: [
          { callId: 'p:code:1', name: 'read', argsRaw: '{"path":"x"}', turn: 1, step: 2, time: 4100, callView: null, subCalls: [] },
        ],
      } as ConversationNode),
      node({ kind: 'turn-error', seq: 6, time: 6000, turn: 1, step: 2, message: 'provider down', code: 'E_LLM' }),
      node({ kind: 'unknown', seq: 7, time: 7000, type: 'x/y', data: { a: 1 } }),
    ]
    const lines = foldConsole(input({
      nodes,
      runningCalls: [{ callId: 'r1', name: 'fs_search', argsRaw: '{"q":"*"}', turn: 2, step: 1, time: 8000, subCalls: [] }],
      partial: { turn: 2, step: 1, blocks: [{ kind: 'text', text: 'Searching' }] },
      pending: [{ kind: 'approval', approvalId: 'ap1' } as unknown as ConsoleInput['pending'][number]],
    }))

    expect(lines.map(line => [line.kind, line.title])).toEqual([
      ['response', 'run_code'],
      ['running', '↳ read'],
      ['error', 'E_LLM'],
      ['system', 'x/y'],
      ['running', 'fs_search'],
      ['partial', ''],
      ['pending', 'approval'],
    ])
    expect(lines[0]).toMatchObject({ isError: true, detail: 'call p · 1000 ms · ToolError/E_FAIL' })
    expect(lines[3]?.text).toBe(safeJson({ a: 1 }))
    expect(lines[5]).toMatchObject({ text: 'Searching', time: null, detail: 'turn 2 · step 1' })
    expect(lines[6]).toMatchObject({ key: 'pending:ap1', detail: 'ap1' })
  })

  it('prints an empty assistant message once and keeps other node kinds readable', () => {
    const nodes: ConversationNode[] = [
      node({ kind: 'assistant', seq: 1, time: 1, turn: 1, step: 1, blocks: [], provenance: { provider: 'p', model: 'm' } } as ConversationNode),
      { kind: 'context', seq: 2, time: 2, content: [{ type: 'text', text: 'AGENTS.md' }], source: 's', provenance: {}, form: 'agents-md' } as unknown as ConversationNode,
      { kind: 'steering', seq: 3, time: 3, messageId: 'm', content: [{ type: 'image', attachment: {} }], source: 's' } as unknown as ConversationNode,
      node({ kind: 'command', seq: 4, time: 4, commandId: 'k' as never, name: 'help', args: null, outcome: { kind: 'success', text: 'ok' } }),
      node({ kind: 'compaction', seq: 5, time: 5, summary: 'short', summaryEventSeq: null, shadowedItemCount: 3, shadowedTokenCount: null }),
      node({ kind: 'turn-max-tokens', seq: 6, time: 6, turn: 1, step: 1 }),
      node({ kind: 'model-retry', seq: 7, time: 7, retryState: 'scheduled', attempt: 2, delayMs: 500 } as unknown as ConversationNode),
    ]

    const lines = foldConsole(input({ nodes }))

    expect(lines.map(line => [line.kind, line.title, line.text])).toEqual([
      ['assistant', 'p/m', ''],
      ['context', 'agents-md', 'AGENTS.md'],
      ['steer', '', '[image]'],
      ['system', '/help', 'ok'],
      ['system', 'compaction', 'short'],
      ['error', 'max tokens', 'The model hit its output limit.'],
      ['system', 'model retry', ''],
    ])
    expect(lines[4]?.detail).toBe('3 items shadowed')
    expect(lines[6]?.detail).toBe('scheduled · attempt 2 · delay 500 ms')
  })
})

describe('helpers', () => {
  it('renders content blocks like a terminal', () => {
    expect(contentText([
      { type: 'text', text: 'a' },
      { type: 'reasoning', text: 'r' },
      { type: 'image' },
      { type: 'tool-call', name: 'bash' },
      { type: 'tool-result', content: [{ type: 'text', text: 'inner' }] },
      { type: 'other', z: 1 },
    ])).toBe('a\n[reasoning] r\n[image]\n[tool-call bash]\ninner\n{\n  "type": "other",\n  "z": 1\n}')
  })

  it('pretty-prints JSON arguments and leaves non-JSON alone', () => {
    expect(prettyArguments('{"a":1}')).toBe('{\n  "a": 1\n}')
    expect(prettyArguments('{not json')).toBe('{not json')
  })

  it('never throws on cyclic or bigint payloads', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(safeJson(cyclic)).toBe('[object Object]')
    expect(safeJson({ n: 1n })).toBe('{\n  "n": "1"\n}')
  })

  it('decides collapse by characters or rows', () => {
    expect(isLong('short')).toBe(false)
    expect(isLong('x'.repeat(1201))).toBe(true)
    expect(isLong(Array.from({ length: LONG_LINE_ROWS + 1 }, () => 'r').join('\n'))).toBe(true)
    expect(isLong(Array.from({ length: LONG_LINE_ROWS }, () => 'r').join('\n'))).toBe(false)
  })
})
