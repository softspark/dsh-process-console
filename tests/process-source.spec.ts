import { describe, expect, it, vi } from 'vitest'
import type { SessionEventWindow, SessionFace, SessionSnapshot } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { TrajectorySnapshot } from '@deepseek-ai/dsh-client-ui-trajectory/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { createProcessSource, ensureOpen, type ProcessBinding } from '../src/client/process-source.ts'

const id = (value: string): SessionId => value as SessionId

interface FakeSession extends SessionFace {
  emit(next: Partial<SessionSnapshot>): void
  readonly open: ReturnType<typeof vi.fn<() => Promise<void>>>
  readonly loadOlder: ReturnType<typeof vi.fn<() => Promise<void>>>
}

function store<T>(initial: T): ObservableSnapshot<T> & { emit(next: T): void } {
  let snapshot = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    emit(next) {
      snapshot = next
      for (const listener of [...listeners]) listener()
    },
  }
}

/** A stand-in for the concrete Session: the public face plus the undeclared `open()`. */
function fakeSession(openState: SessionSnapshot['openState'], withOpen = true): FakeSession {
  const state = store<SessionSnapshot>({
    sessionId: id('session'), queue: [], pendingSubmissions: [], running: false,
    subagent: null, removed: false, openState, openError: null, hasMore: true,
    loadingOlder: false, promptError: null, blank: false, lastAgentError: null,
    promptAttempted: false, awaitingFirstTurn: false,
  })
  const session = {
    ...state,
    loadOlder: vi.fn(async () => {}),
    emit(next: Partial<SessionSnapshot>) {
      state.emit({ ...state.getSnapshot(), ...next })
    },
    open: vi.fn(async () => {
      state.emit({ ...state.getSnapshot(), openState: 'open' })
    }),
  } as unknown as FakeSession
  if (!withOpen) delete (session as { open?: unknown }).open
  return session
}

function fakeBinding(openState: SessionSnapshot['openState'] = 'open') {
  const session = fakeSession(openState)
  const events = store<SessionEventWindow>({
    entries: [], hasMore: true, revision: 0, change: { kind: 'replace', entries: [] },
  })
  const trajectory = store<TrajectorySnapshot | undefined>({
    eventNodes: [], eventLocations: new Map(), requests: [], callSchemas: new Map(),
    partial: null, runningCalls: [],
  })
  const conversation = store<ConversationSnapshot>({
    views: { get: () => undefined }, activeTargets: new Set(),
  })
  session.loadOlder.mockImplementation(async () => {
    events.emit({ ...events.getSnapshot(), revision: events.getSnapshot().revision + 1 })
  })
  return { session, events, trajectory, conversation }
}

const pendingStore = () => store<ReadonlyMap<SessionId, unknown>>(new Map())

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

    const throwing = fakeSession('cold')
    throwing.open.mockImplementationOnce(() => { throw new Error('unavailable') })
    expect(ensureOpen(throwing)).toBe(false)
  })
})

describe('createProcessSource', () => {
  it('publishes the selected window live and re-targets on select', () => {
    const root = fakeBinding('open')
    const child = fakeBinding('cold')
    const faces = new Map<SessionId, ProcessBinding>([[id('root'), root], [id('child'), child]])
    const pending = pendingStore()
    const source = createProcessSource(sessionId => faces.get(sessionId), pending)
    const listener = vi.fn()
    source.subscribe(listener)

    expect(source.getSnapshot()).toEqual({ selected: null, status: 'idle', conversation: null })

    source.select(id('root'))
    expect(source.getSnapshot()).toMatchObject({ selected: 'root', status: 'live' })
    expect(listener).toHaveBeenCalledTimes(1)

    root.session.emit({ running: true })
    expect(source.getSnapshot().conversation?.running).toBe(true)
    expect(listener).toHaveBeenCalledTimes(2)

    // A repeat select is a no-op: no resubscribe, no notification.
    source.select(id('root'))
    expect(listener).toHaveBeenCalledTimes(2)

    source.select(id('child'))
    expect(child.session.open).toHaveBeenCalledTimes(1)
    expect(source.getSnapshot()).toMatchObject({ selected: 'child', status: 'live' })
    // The previous session's changes no longer reach the source.
    root.session.emit({ running: false })
    expect(source.getSnapshot().conversation?.running).toBe(false)
    expect(listener).toHaveBeenCalledTimes(3)

    const question = { key: 'question-1', kind: 'question', sessionId: id('child') }
    pending.emit(new Map<SessionId, unknown>([[id('child'), question], [id('root'), { kind: 'approval' }]]))
    expect(source.getSnapshot().conversation?.pending).toEqual([question])
    pending.emit(new Map())
    expect(source.getSnapshot().conversation?.pending).toEqual([])
  })

  it('reports an unreachable process and retries it on the next select', () => {
    const faces = new Map<SessionId, ProcessBinding>()
    const source = createProcessSource(sessionId => faces.get(sessionId), pendingStore())

    source.select(id('ghost'))
    expect(source.getSnapshot()).toEqual({ selected: 'ghost', status: 'unavailable', conversation: null })

    faces.set(id('ghost'), fakeBinding('open'))
    source.select(id('ghost'))
    expect(source.getSnapshot().status).toBe('live')
  })

  it('pages older history only for a bound window and resets on dispose', async () => {
    const face = fakeBinding('open')
    const source = createProcessSource(() => face, pendingStore())
    expect(await source.loadOlder()).toBe(false)

    source.select(id('s'))
    expect(await source.loadOlder()).toBe(true)
    expect(face.session.loadOlder).toHaveBeenCalledTimes(1)
    face.session.loadOlder.mockImplementationOnce(async () => {})
    expect(await source.loadOlder()).toBe(false)

    const listener = vi.fn()
    source.subscribe(listener)
    source.dispose()
    face.session.emit({ running: true })
    expect(listener).not.toHaveBeenCalled()
    expect(source.getSnapshot()).toEqual({ selected: null, status: 'idle', conversation: null })
  })

  it('reports an unregistered trajectory and recovers when that target publishes', () => {
    const face = fakeBinding()
    const target = face.trajectory.getSnapshot()
    face.trajectory.emit(undefined)
    const source = createProcessSource(() => face, pendingStore())
    source.select(id('s'))
    expect(source.getSnapshot().status).toBe('unavailable')
    face.trajectory.emit(target)
    expect(source.getSnapshot().status).toBe('live')
    expect(source.getSnapshot().conversation?.nodes).toBe(target?.eventNodes)
  })

  it('keeps the selected process custom views reactive independently of the trajectory', () => {
    const face = fakeBinding()
    const source = createProcessSource(() => face, pendingStore())
    source.select(id('s'))
    const views = { get: () => undefined }
    face.conversation.emit({ views, activeTargets: new Set(['process-console']) })
    expect(source.getSnapshot().conversation?.views).toBe(views)
    expect(source.getSnapshot().conversation?.activeTargets.has('process-console')).toBe(true)
  })

  it('rejects a cold controller without an open operation', () => {
    const face = fakeBinding('cold')
    delete (face.session as { open?: unknown }).open
    const source = createProcessSource(() => face, pendingStore())
    source.select(id('s'))
    expect(source.getSnapshot().status).toBe('unavailable')
  })

  it('ignores pagination completing after selection leaves and returns to the same binding', async () => {
    const root = fakeBinding()
    const child = fakeBinding()
    const source = createProcessSource(key => key === id('root') ? root : child, pendingStore())
    let complete: (() => void) | undefined
    root.session.loadOlder.mockImplementationOnce(() => new Promise<void>(resolve => { complete = resolve }))
    source.select(id('root'))
    const paging = source.loadOlder()
    source.select(id('child'))
    source.select(id('root'))
    root.events.emit({ ...root.events.getSnapshot(), revision: 1 })
    complete?.()
    expect(await paging).toBe(false)
    expect(source.getSnapshot().selected).toBe('root')
  })

  it('detaches a subscription when synchronous activation changes the selection', () => {
    const root = fakeBinding()
    const child = fakeBinding()
    const source = createProcessSource(key => key === id('root') ? root : child, pendingStore())
    const subscribe = root.trajectory.subscribe
    root.trajectory.subscribe = listener => {
      const unsubscribe = subscribe(listener)
      source.select(id('child'))
      return unsubscribe
    }
    source.select(id('root'))
    const listener = vi.fn()
    source.subscribe(listener)
    root.trajectory.emit(root.trajectory.getSnapshot())
    root.session.emit({ running: true })
    expect(source.getSnapshot().selected).toBe('child')
    expect(listener).not.toHaveBeenCalled()
    child.session.emit({ running: true })
    expect(source.getSnapshot().conversation?.running).toBe(true)
  })
})
