import { describe, expect, it, vi } from 'vitest'
import type { ConversationSnapshot, SessionFace, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { createProcessSource, ensureOpen } from '../src/client/process-source.ts'

const id = (value: string): SessionId => value as SessionId

interface FakeSession extends SessionFace {
  emit(next: Partial<ConversationSnapshot>): void
  readonly open: ReturnType<typeof vi.fn>
}

/** A stand-in for the concrete Session: the public face plus the undeclared `open()`. */
function fakeSession(openState: ConversationSnapshot['openState'], withOpen = true): FakeSession {
  let snapshot = { openState, nodes: [] } as unknown as ConversationSnapshot
  const listeners = new Set<() => void>()
  const session = {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    loadOlder: vi.fn(async () => {
      snapshot = { ...snapshot, nodes: [...snapshot.nodes, {} as never] }
    }),
    emit(next: Partial<ConversationSnapshot>) {
      snapshot = { ...snapshot, ...next }
      for (const listener of listeners) listener()
    },
    open: vi.fn(async () => {
      snapshot = { ...snapshot, openState: 'open' }
    }),
  } as unknown as FakeSession
  if (!withOpen) delete (session as { open?: unknown }).open
  return session
}

describe('ensureOpen', () => {
  it('opens a cold window once and reports an unopenable face', async () => {
    const cold = fakeSession('cold')
    expect(ensureOpen(cold)).toBe(true)
    expect(cold.open).toHaveBeenCalledTimes(1)

    const open = fakeSession('open')
    expect(ensureOpen(open)).toBe(true)
    expect(open.open).not.toHaveBeenCalled()

    expect(ensureOpen(fakeSession('cold', false))).toBe(false)

    const failing = fakeSession('cold')
    failing.open.mockRejectedValueOnce(new Error('offline'))
    expect(ensureOpen(failing)).toBe(true)
    await Promise.resolve()
  })
})

describe('createProcessSource', () => {
  it('publishes the selected window live and re-targets on select', () => {
    const root = fakeSession('open')
    const child = fakeSession('cold')
    const faces = new Map<SessionId, SessionFace>([[id('root'), root], [id('child'), child]])
    const source = createProcessSource(sessionId => faces.get(sessionId))
    const listener = vi.fn()
    source.subscribe(listener)

    expect(source.getSnapshot()).toEqual({ selected: null, status: 'idle', conversation: null })

    source.select(id('root'))
    expect(source.getSnapshot()).toMatchObject({ selected: 'root', status: 'live' })
    expect(listener).toHaveBeenCalledTimes(1)

    root.emit({ running: true })
    expect(source.getSnapshot().conversation?.running).toBe(true)
    expect(listener).toHaveBeenCalledTimes(2)

    // A repeat select is a no-op: no resubscribe, no notification.
    source.select(id('root'))
    expect(listener).toHaveBeenCalledTimes(2)

    source.select(id('child'))
    expect(child.open).toHaveBeenCalledTimes(1)
    expect(source.getSnapshot()).toMatchObject({ selected: 'child', status: 'live' })
    // The previous session's changes no longer reach the source.
    root.emit({ running: false })
    expect(source.getSnapshot().conversation?.running).toBeUndefined()
    expect(listener).toHaveBeenCalledTimes(3)
  })

  it('reports an unreachable process and retries it on the next select', () => {
    const faces = new Map<SessionId, SessionFace>()
    const source = createProcessSource(sessionId => faces.get(sessionId))

    source.select(id('ghost'))
    expect(source.getSnapshot()).toEqual({ selected: 'ghost', status: 'unavailable', conversation: null })

    faces.set(id('ghost'), fakeSession('open'))
    source.select(id('ghost'))
    expect(source.getSnapshot().status).toBe('live')
  })

  it('pages older history only for a bound window and resets on dispose', async () => {
    const face = fakeSession('open')
    const source = createProcessSource(() => face)
    expect(await source.loadOlder()).toBe(false)

    source.select(id('s'))
    expect(await source.loadOlder()).toBe(true)
    expect(face.loadOlder).toHaveBeenCalledTimes(1)

    const listener = vi.fn()
    source.subscribe(listener)
    source.dispose()
    face.emit({ running: true })
    expect(listener).not.toHaveBeenCalled()
    expect(source.getSnapshot()).toEqual({ selected: null, status: 'idle', conversation: null })
  })
})
