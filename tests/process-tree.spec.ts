import { describe, expect, it } from 'vitest'
import type { SessionId, SessionListState } from '@deepseek-ai/dsh-client-runtime/client'
import { buildProcessTree } from '../src/client/process-tree.ts'

const id = (value: string): SessionId => value as SessionId

type Summary = SessionListState['byId'][SessionId]

function summary(partial: Partial<Summary> & { id: SessionId }): Summary {
  return {
    displayTitle: partial.id,
    running: false,
    blank: false,
    updatedAt: 0,
    ...partial,
  } as Summary
}

describe('buildProcessTree', () => {
  it('lists the root and its descendants depth-first in host order', () => {
    const list = {
      ids: [id('other'), id('root'), id('b'), id('a'), id('a1')],
      byId: {
        [id('other')]: summary({ id: id('other') }),
        [id('root')]: summary({ id: id('root'), displayTitle: 'Root', running: true, agentPreset: 'std' }),
        [id('a')]: summary({ id: id('a'), parentId: id('root'), origin: 'subagent', displayTitle: 'A' }),
        [id('b')]: summary({ id: id('b'), parentId: id('root'), origin: 'subagent', displayTitle: 'B', running: true }),
        [id('a1')]: summary({ id: id('a1'), parentId: id('a'), origin: 'subagent', displayTitle: 'A1' }),
      },
    } as unknown as Pick<SessionListState, 'ids' | 'byId'>

    const tree = buildProcessTree(list, id('root'))

    expect(tree.map(entry => [entry.id, entry.depth, entry.parentId])).toEqual([
      ['root', 0, null],
      ['b', 1, 'root'],
      ['a', 1, 'root'],
      ['a1', 2, 'a'],
    ])
    expect(tree[0]).toMatchObject({ label: 'Root', running: true, agentPreset: 'std', subagent: false })
    expect(tree[1]).toMatchObject({ label: 'B', running: true, subagent: true })
    // A session outside the root's lineage is not a process of this conversation.
    expect(tree.some(entry => entry.id === id('other'))).toBe(false)
  })

  it('keeps a root the list has not projected yet and cuts a parent cycle', () => {
    const list = {
      ids: [id('x'), id('y')],
      byId: {
        [id('x')]: summary({ id: id('x'), parentId: id('y') }),
        [id('y')]: summary({ id: id('y'), parentId: id('x') }),
      },
    } as unknown as Pick<SessionListState, 'ids' | 'byId'>

    expect(buildProcessTree(list, id('missing'))).toEqual([
      { id: 'missing', parentId: null, depth: 0, label: 'missing', running: false, agentPreset: undefined, subagent: false },
    ])
    expect(buildProcessTree(list, id('x')).map(entry => entry.id)).toEqual(['x', 'y'])
  })
})
