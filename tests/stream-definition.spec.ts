import { describe, expect, it } from 'vitest'
import type { ConversationMatch, ConversationNodeContext } from '@deepseek-ai/dsh-client-ui-conversation/client'
import {
  ProcessConsoleViewBuilder, readStreamData, streamNodeDefinition,
  type ExternalProcess, type ProcessConsoleViewNode,
} from '../src/client/stream-definition.ts'

function event(seq: number, time: number, data: unknown, type = 'subagent/stream') {
  return { type, seq, time, data } as unknown as ConversationMatch['event']
}

function match(seq: number, time: number, data: unknown, role: 'start'): Extract<ConversationMatch, { role: 'start' }>
function match(seq: number, time: number, data: unknown, role?: 'update'): ConversationMatch
function match(seq: number, time: number, data: unknown, role: 'start' | 'update' = 'update'): ConversationMatch {
  return { event: event(seq, time, data), view: undefined, role, location: { kind: 'unresolved' } } as unknown as ConversationMatch
}

function context(state: ExternalProcess | undefined): ConversationNodeContext<ExternalProcess> & { state: ExternalProcess } {
  return {
    key: 'k', kind: 'process-console-stream', id: state?.childId ?? 'x', matches: [], start: undefined, state, current: new Map(),
  } as unknown as ConversationNodeContext<ExternalProcess> & { state: ExternalProcess }
}

const reader = { previous: () => undefined }

const first = { childId: 'c1', provider: 'claude-code', index: 0, item: { kind: 'system', text: 'init' } }
const call = { childId: 'c1', provider: 'claude-code', index: 1, item: { kind: 'tool-call', name: 'Bash', callId: 't1', text: '{}' } }
const result = { childId: 'c1', provider: 'claude-code', index: 2, item: { kind: 'result', text: 'ok', isError: false, meta: { subtype: 'success' } }, truncated: true }

describe('streamNodeDefinition', () => {
  it('matches only well-formed stream events, keyed by child id', () => {
    expect(streamNodeDefinition.match(event(1, 1, first))).toEqual({ id: 'c1', role: 'start' })
    expect(streamNodeDefinition.match(event(2, 2, call))).toEqual({ id: 'c1', role: 'update' })
    expect(streamNodeDefinition.match(event(3, 3, first, 'tool/call'))).toBeNull()
    expect(streamNodeDefinition.match(event(4, 4, { childId: 'c', provider: 'p', index: 0, item: { kind: 'nope' } }))).toBeNull()
    expect(streamNodeDefinition.match(event(5, 5, 'garbage'))).toBeNull()
    expect(readStreamData({ childId: 'c', provider: 'p', index: 'x', item: { kind: 'assistant' } })).toBeUndefined()
  })

  it('folds a child from its first event and appends later steps', () => {
    const state = streamNodeDefinition.start(context(undefined), match(10, 1000, first, 'start'), reader)
    expect(state).toEqual({
      childId: 'c1', provider: 'claude-code', firstSeq: 10, firstTime: 1000, lastTime: 1000, done: false,
      steps: [{ seq: 10, time: 1000, index: 0, kind: 'system', text: 'init', name: undefined, callId: undefined, isError: false, meta: undefined, truncated: false }],
    })

    const withCall = streamNodeDefinition.update(context(state), match(11, 1500, call))
    const finished = streamNodeDefinition.update(context(withCall), match(12, 2000, result))
    expect(finished.steps.map(step => [step.index, step.kind, step.name, step.callId, step.truncated])).toEqual([
      [0, 'system', undefined, undefined, false],
      [1, 'tool-call', 'Bash', 't1', false],
      [2, 'result', undefined, undefined, true],
    ])
    expect(finished).toMatchObject({ lastTime: 2000, done: true })
    // Malformed later data leaves the record untouched.
    expect(streamNodeDefinition.update(context(finished), match(13, 2100, 'junk'))).toBe(finished)

    const node = streamNodeDefinition.buildViewNode?.(context(finished)) as ProcessConsoleViewNode
    expect(node).toMatchObject({ key: 'k', kind: 'process-console-stream', id: 'c1', target: 'process-console' })
    expect(node.data).toBe(finished)
    expect(streamNodeDefinition.buildViewNode?.(context(undefined))).toBeNull()
  })

  it('refuses a start without stream data', () => {
    expect(() => streamNodeDefinition.start(context(undefined), match(1, 1, 'junk', 'start'), reader))
      .toThrow(/stream start without stream data/u)
  })
})

describe('ProcessConsoleViewBuilder', () => {
  const processOf = (childId: string, firstSeq: number): ExternalProcess => ({
    childId, provider: 'acp', firstSeq, firstTime: firstSeq, lastTime: firstSeq, steps: [], done: false,
  })
  const nodeOf = (process: ExternalProcess): ProcessConsoleViewNode => ({
    key: process.childId, kind: 'process-console-stream', id: process.childId, target: 'process-console', data: process,
  })

  it('keeps children in first-seen order, replaces on upsert and resets on replace', () => {
    const builder = new ProcessConsoleViewBuilder()
    expect(builder.empty.externals.size).toBe(0)

    const timeline = { turnOrder: [], turns: new Map() }
    const one = builder.apply({ upserts: [nodeOf(processOf('b', 5)), nodeOf(processOf('a', 2))], timeline })
    expect([...one.externals.keys()]).toEqual(['a', 'b'])

    const updated = { ...processOf('b', 5), done: true }
    const two = builder.apply({ upserts: [nodeOf(updated)], timeline })
    expect(two.externals.get('b')?.done).toBe(true)
    expect(two.externals.size).toBe(2)
    expect(two).not.toBe(one)

    const foreign = { ...nodeOf(processOf('z', 1)), target: 'trajectory' } as unknown as ProcessConsoleViewNode
    expect(builder.apply({ upserts: [foreign], timeline }).externals.has('z')).toBe(false)

    const replaced = builder.replace({ nodes: [nodeOf(processOf('c', 9))], timeline })
    expect([...replaced.externals.keys()]).toEqual(['c'])
  })
})
