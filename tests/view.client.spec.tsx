// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ConversationNode, ConversationSnapshot, SessionId, SessionListState } from '@deepseek-ai/dsh-client-runtime/client'
import { en } from '../src/client/locales.ts'
import { createProcessSource, type ProcessSnapshot } from '../src/client/process-source.ts'
import {
  formatTime, ProcessConsoleView, truncate, type ProcessConsoleViewProps,
} from '../src/client/ProcessConsoleView.tsx'

const id = (value: string): SessionId => value as SessionId
const t = ((key: keyof typeof en) => en[key]) as ProcessConsoleViewProps['t']

afterEach(cleanup)

const nodes: ConversationNode[] = [
  { kind: 'user', seq: 1, time: 0, source: 'human', content: [{ type: 'text', text: 'hello agent' }] },
  {
    kind: 'tool-result', seq: 2, time: 900, callId: 'c1', call: { name: 'bash', argsRaw: '{"command":"ls"}' },
    callTime: 400, content: [{ type: 'text', text: 'a.txt' }], isError: false, callView: null, resultView: null, subCalls: [],
  } as ConversationNode,
]

function conversation(partial: Partial<ConversationSnapshot>): ConversationSnapshot {
  return {
    nodes, partial: null, runningCalls: [], pending: [], openState: 'open', openError: null, hasMore: false, running: false,
    ...partial,
  } as unknown as ConversationSnapshot
}

function list(): SessionListState {
  return {
    ids: [id('root'), id('child')],
    byId: {
      [id('root')]: { id: id('root'), displayTitle: 'Root task', running: true },
      [id('child')]: { id: id('child'), displayTitle: 'Explorer', running: false, parentId: id('root'), origin: 'subagent' },
    },
  } as unknown as SessionListState
}

function renderView(options: { hasMore?: boolean; childState?: ConversationSnapshot['openState'] } = {}) {
  const snapshots = new Map<SessionId, ConversationSnapshot>([
    [id('root'), conversation({ hasMore: options.hasMore ?? false })],
    [id('child'), conversation({ nodes: [], openState: options.childState ?? 'open' })],
  ])
  const source = createProcessSource(sessionId => {
    const snapshot = snapshots.get(sessionId)
    if (snapshot === undefined) return undefined
    return {
      getSnapshot: () => snapshot,
      subscribe: () => () => {},
      loadOlder: vi.fn(async () => {}),
      // The concrete Session's undeclared opener; a fake that never settles the window keeps it cold.
      open: async () => {},
    } as unknown as ReturnType<Parameters<typeof createProcessSource>[0]>
  })
  source.select(id('root'))
  const listState = list()
  const select = vi.fn((sessionId: SessionId) => { source.select(sessionId) })
  const loadOlder = vi.fn(async () => true)
  const props = {
    sessionId: id('root'),
    useSessions: <R,>(pick: (state: SessionListState) => R) => pick(listState),
    useProcess: <R,>(pick: (state: ProcessSnapshot) => R) => pick(source.getSnapshot()),
    select,
    loadOlder,
    t,
  } as unknown as ProcessConsoleViewProps
  const view = render(<ProcessConsoleView {...props} />)
  return { view, select, loadOlder, source, rerender: () => view.rerender(<ProcessConsoleView {...props} />) }
}

describe('ProcessConsoleView', () => {
  it('lists the processes and prints the root console with paired request and response', () => {
    renderView()

    const tree = screen.getByRole('navigation', { name: en['tree.title'] })
    expect(tree.textContent).toContain('main · Root task')
    expect(tree.textContent).toContain('Explorer')

    const rows = screen.getAllByRole('row')
    expect(rows.map(row => row.textContent)).toEqual([
      expect.stringContaining('hello agent'),
      expect.stringContaining('bash'),
    ])
    expect(rows[1]?.textContent).toContain('call c1 · 500 ms')
    expect(rows[1]?.textContent).toContain('a.txt')
  })

  it('switches to a child process and shows its empty console', () => {
    const { select, rerender } = renderView()

    fireEvent.click(screen.getByRole('button', { name: /Explorer/u }))
    expect(select).toHaveBeenCalledWith('child')
    rerender()

    expect(screen.queryAllByRole('row')).toHaveLength(0)
    expect(screen.getByText(en['console.empty'])).toBeTruthy()
  })

  it('reports a cold child window and an unreachable process', () => {
    const { rerender, source } = renderView({ childState: 'cold' })
    source.select(id('child'))
    rerender()
    expect(screen.getByText(en['console.cold'])).toBeTruthy()

    source.select(id('nobody'))
    rerender()
    expect(screen.getByText(en['console.unavailable'])).toBeTruthy()
  })

  it('filters lines, toggles raw payloads and pages older history', async () => {
    const { loadOlder } = renderView({ hasMore: true })

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'a.txt' } })
    expect(screen.getAllByRole('row')).toHaveLength(1)

    // The toolbar toggle precedes the per-line ones in document order.
    const [rawAll] = screen.getAllByRole('button', { name: en['console.raw'] })
    fireEvent.click(rawAll as HTMLElement)
    expect(screen.getAllByText(/"callId": "c1"/u).length).toBeGreaterThan(0)
    // Per-line toggles yield to the global one.
    expect(screen.getAllByRole('button', { name: en['console.raw'] })[1]).toHaveProperty('disabled', true)

    fireEvent.click(screen.getByRole('button', { name: en['console.loadOlder'] }))
    expect(loadOlder).toHaveBeenCalledTimes(1)
    await Promise.resolve()
  })
})

describe('formatting helpers', () => {
  it('formats clock time and blanks a missing one', () => {
    expect(formatTime(null)).toBe('')
    expect(formatTime(new Date(2026, 0, 1, 9, 5, 7, 42).getTime())).toBe('09:05:07.042')
  })

  it('truncates by rows and by characters', () => {
    const rows = Array.from({ length: 40 }, (_, index) => `row ${index}`).join('\n')
    expect(truncate(rows)).toEqual({ head: rows.split('\n').slice(0, 30).join('\n'), hiddenRows: 10 })
    expect(truncate('x'.repeat(2000))).toEqual({ head: 'x'.repeat(1200), hiddenRows: 0 })
  })
})
