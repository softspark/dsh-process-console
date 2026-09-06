// @vitest-environment jsdom
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createChildReader } from '../src/client/child-reader.ts'
import { resolveProcessBinding } from '../src/client/index.tsx'

vi.mock('../src/client/child-reader.ts', () => ({ createChildReader: vi.fn() }))

const id = (value: string): SessionId => value as SessionId
const child = (value: string, mode: 'one-shot' | 'continuable' = 'one-shot') => ({
  kind: 'child', id: id(value), mode, label: value, activity: 'running', hasChildren: false,
})

function context() {
  const remote = { session: 'existing gateway' }
  const catalog = {
    root: { entries: [child('nested')] },
    nested: { entries: [child('leaf', 'continuable'), { kind: 'diagnostic', id: id('broken'), reason: 'unavailable' }] },
    unrelated: { entries: [child('foreign')] },
  }
  const ctx = {
    sessions: { binding: () => undefined, list: { getSnapshot: () => ({ ids: [id('root')], byId: {}, subagentsByParent: catalog }) } },
    uiConversation: { events: {}, views: {} },
    remote,
    get: () => remote,
  } as unknown as Context
  return { ctx, remote }
}

beforeEach(() => vi.clearAllMocks())

describe('catalog child reader integration', () => {
  it('uses the actual direct-parent address for a descendant without navigating Chat', () => {
    const { ctx, remote } = context()
    resolveProcessBinding(ctx, id('root'), id('leaf'))
    expect(createChildReader).toHaveBeenCalledOnce()
    expect(createChildReader).toHaveBeenCalledWith({
      address: { kind: 'subagent', parentSessionId: 'nested', childSessionId: 'leaf', mode: 'continuable' },
      remote, eventDefinitions: ctx.uiConversation.events, viewDefinitions: ctx.uiConversation.views, initialRunning: true,
    })
  })

  it('prefers the durable catalog address over an existing ordinary child binding', () => {
    const { ctx } = context()
    const ordinary = vi.spyOn(ctx.sessions, 'binding').mockImplementation(() => { throw new Error('ordinary child address must not be used') })
    resolveProcessBinding(ctx, id('root'), id('leaf'))
    expect(createChildReader).toHaveBeenCalledOnce()
    expect(ordinary).not.toHaveBeenCalled()
  })

  it('does not invent a child address for another tree, an unknown id, or a diagnostic row', () => {
    const { ctx } = context()
    for (const target of ['foreign', 'unknown', 'broken', 'root']) {
      expect(resolveProcessBinding(ctx, id('root'), id(target))).toBeUndefined()
    }
    expect(createChildReader).not.toHaveBeenCalled()
  })
})
