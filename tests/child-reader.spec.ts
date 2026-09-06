// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/dsh-process-console

import { describe, expect, it, vi } from 'vitest'
import type {
  SessionEventLikeEntry, SessionEventStreamOptions, SessionEventWindow, SessionJournalChange,
} from '@deepseek-ai/dsh-api-session-controller/client'
import type { ConversationViewSnapshotMap } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { TrajectorySnapshot } from '@deepseek-ai/dsh-client-ui-trajectory/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { createChildReader, type ChildReaderFactories, type ChildReaderOptions } from '../src/client/child-reader.ts'

// Published client entries are DSH ModuleLoader registrations, not Node ESM.
// Test the reader through narrow constructor DI; production uses the public classes.
vi.mock('@deepseek-ai/dsh-api-session-controller/client', () => ({
  SessionEventStream: class {}, MutableSessionEventSource: class {},
}))
vi.mock('@deepseek-ai/dsh-client-ui-conversation/client', () => ({ ConversationNodeAssembler: class {} }))

function deferred() {
  let resolve: () => void = () => {}
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}

function event(seq: number): SessionEventLikeEntry {
  return { type: 'event', event: { type: 'turn/start', seq, time: seq, data: {} } } as SessionEventLikeEntry
}

function page(type: 'replace' | 'prepend', seqs: readonly number[], hasMore: boolean): SessionJournalChange {
  const entries = seqs.map(event)
  return { type, entries, hasMore, page: { records: [], hasMore } }
}

function eventSource(): ReturnType<ChildReaderFactories['events']> {
  let snapshot: SessionEventWindow = {
    entries: [], hasMore: false, revision: 0, change: { kind: 'replace', entries: [] },
  }
  const listeners = new Set<() => void>()
  const set = (entries: readonly SessionEventLikeEntry[], hasMore: boolean, change: SessionEventWindow['change']): void => {
    snapshot = { entries, hasMore, change, revision: snapshot.revision + 1 }
    for (const listener of listeners) listener()
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
    replace: (entries, hasMore) => { set(entries, hasMore, { kind: 'replace', entries }) },
    prepend: (entries, hasMore) => { set([...entries, ...snapshot.entries], hasMore, { kind: 'prepend', entries }) },
    append: (entry) => { set([...snapshot.entries, entry], snapshot.hasMore, { kind: 'append', entries: [entry] }) },
  }
}

function setup() {
  let sinks: SessionEventStreamOptions | undefined
  const activeTargets = new Set<string>()
  let trajectory: TrajectorySnapshot = {
    eventNodes: [], eventLocations: new Map(), requests: [], callSchemas: new Map(), partial: null, runningCalls: [],
  }
  const assembler: ReturnType<ChildReaderFactories['assembler']> = {
    activateTarget: vi.fn(target => { activeTargets.add(target); return true }),
    replaceWindow: vi.fn(() => 'immediate' as const),
    prepend: vi.fn(() => 'immediate' as const),
    append: vi.fn(() => 'immediate' as const),
    flush: vi.fn(() => { trajectory = { ...trajectory }; return true }),
    get: <Target extends Extract<keyof ConversationViewSnapshotMap, string>>(target: Target) => (
      target === 'trajectory' ? trajectory : undefined
    ) as ConversationViewSnapshotMap[Target] | undefined,
    activityTargets: () => activeTargets,
  }
  const stream = {
    open: vi.fn(async () => { sinks?.publish(page('replace', [10, 11], true)) }),
    prepend: vi.fn(async () => { sinks?.publish(page('prepend', [8, 9], false)) }),
    dispose: vi.fn(async () => {}),
  }
  const factories: ChildReaderFactories = {
    events: eventSource,
    assembler: () => assembler,
    stream: vi.fn((_remote, _address, options) => { sinks = options; return stream }),
  }
  const options: ChildReaderOptions = {
    address: { kind: 'subagent', parentSessionId: 'parent' as SessionId, childSessionId: 'child' as SessionId, mode: 'continuable' },
    remote: {} as ChildReaderOptions['remote'],
    eventDefinitions: { entries: () => [], fallbackEntry: () => undefined },
    viewDefinitions: { entries: () => [] },
  }
  const reader = createChildReader(options, factories)
  return { reader, stream, assembler, factories, options, publish: (change: SessionJournalChange) => sinks?.publish(change), fail: (error: unknown) => sinks?.failed(error) }
}

describe('catalog child reader', () => {
  it('opens the catalog-bound address without exposing navigation or Session mutation methods', async () => {
    const { reader, stream, factories, options, assembler } = setup()
    expect(reader.session.getSnapshot().openState).toBe('cold')
    expect(Object.keys(reader.session).sort()).toEqual(['getSnapshot', 'loadOlder', 'open', 'subscribe'])
    await reader.session.open()
    expect(factories.stream).toHaveBeenCalledWith(options.remote, options.address, expect.any(Object))
    expect(stream.open).toHaveBeenCalledWith({})
    expect(assembler.activateTarget).toHaveBeenCalledWith('trajectory')
    expect(assembler.activateTarget).toHaveBeenCalledWith('process-console')
    expect(reader.session.getSnapshot()).toMatchObject({ sessionId: 'child', openState: 'open', hasMore: true })
    reader.dispose()
  })

  it('routes replacement, append and older pages through the assembler before publishing snapshots', async () => {
    const { reader, assembler, publish } = setup()
    const observed: number[] = []
    const unsubscribe = reader.conversation.subscribe(() => { observed.push(reader.events.getSnapshot().revision) })
    await reader.session.open()
    const firstTrajectory = reader.trajectory.getSnapshot()
    const appended = event(12)
    if (appended.type !== 'event') throw new Error('Expected scalar test event')
    publish({ type: 'append', entry: appended })
    expect(reader.trajectory.getSnapshot()).not.toBe(firstTrajectory)
    expect(assembler.append).toHaveBeenCalledWith(appended)
    expect(reader.events.getSnapshot().entries.map(entry => entry.event.seq)).toEqual([10, 11, 12])
    await reader.session.loadOlder()
    expect(assembler.prepend).toHaveBeenCalledWith([event(8), event(9)], false)
    expect(reader.events.getSnapshot().entries.map(entry => entry.event.seq)).toEqual([8, 9, 10, 11, 12])
    publish(page('replace', [20], false))
    expect(assembler.replaceWindow).toHaveBeenLastCalledWith([event(20)], false)
    expect(reader.events.getSnapshot().entries.map(entry => entry.event.seq)).toEqual([20])
    expect(observed).toEqual([1, 2, 3, 4])
    expect(reader.conversation.getSnapshot().activeTargets.has('trajectory')).toBe(true)
    unsubscribe()
    reader.dispose()
  })

  it('deduplicates opening and concurrent paging, and preserves the oldest durable cursor', async () => {
    const { reader, stream } = setup()
    const opening = deferred()
    const normalOpen = stream.open.getMockImplementation()
    stream.open.mockImplementation(async () => { await opening.promise; await normalOpen?.() })
    const first = reader.session.open()
    expect(reader.session.open()).toBe(first)
    expect(reader.session.getSnapshot().openState).toBe('loading')
    await reader.session.loadOlder()
    expect(stream.prepend).not.toHaveBeenCalled()
    opening.resolve()
    await first
    const paging = deferred()
    const normalPrepend = stream.prepend.getMockImplementation()
    stream.prepend.mockImplementation(async () => { await paging.promise; await normalPrepend?.() })
    const older = reader.session.loadOlder()
    expect(reader.session.loadOlder()).toBe(older)
    expect(reader.session.getSnapshot().loadingOlder).toBe(true)
    paging.resolve()
    await older
    expect(stream.prepend).toHaveBeenCalledExactlyOnceWith({ beforeSeq: 10 })
    expect(reader.session.getSnapshot()).toMatchObject({ loadingOlder: false, hasMore: false })
    await reader.session.loadOlder()
    expect(stream.prepend).toHaveBeenCalledTimes(1)
    reader.dispose()
  })

  it('shows a user-safe opening error for unknown failures', async () => {
    const { reader, stream } = setup()
    stream.open.mockRejectedValue(new Error('PRIVATE_INTERNAL_DETAIL'))
    await reader.session.open()
    expect(reader.session.getSnapshot()).toMatchObject({ openState: 'error', openError: { message: 'Unable to read the child session.' } })
    expect(JSON.stringify(reader.session.getSnapshot())).not.toContain('PRIVATE_INTERNAL_DETAIL')
    reader.dispose()
  })

  it('latches requests before notifying synchronous observers that reenter open or paging', async () => {
    const { reader, stream } = setup()
    let reenteredOpen: Promise<void> | undefined
    let reenteredPage: Promise<void> | undefined
    reader.session.subscribe(() => {
      const state = reader.session.getSnapshot()
      if (state.openState === 'loading') reenteredOpen = reader.session.open()
      if (state.loadingOlder) reenteredPage = reader.session.loadOlder()
    })
    const opening = reader.session.open()
    expect(reenteredOpen).toBe(opening)
    await opening
    const paging = reader.session.loadOlder()
    expect(reenteredPage).toBe(paging)
    await paging
    expect(stream.open).toHaveBeenCalledTimes(1)
    expect(stream.prepend).toHaveBeenCalledTimes(1)
    reader.dispose()
  })

  it('retains the rendered window after a terminal gateway failure and ignores late events', async () => {
    const { reader, fail, publish } = setup()
    await reader.session.open()
    const window = reader.events.getSnapshot()
    fail({ code: 'subagent/not-found', message: 'The child is unavailable.' })
    publish(page('replace', [999], false))
    expect(reader.events.getSnapshot()).toBe(window)
    expect(reader.session.getSnapshot()).toMatchObject({ openState: 'error', openError: { message: 'The child is unavailable.' } })
    reader.dispose()
  })

  it('reports paging failures without discarding the last window or leaving paging busy', async () => {
    const { reader, stream } = setup()
    await reader.session.open()
    stream.prepend.mockRejectedValue({ code: 'gateway/unavailable', message: 'History is unavailable.' })
    await reader.session.loadOlder()
    expect(reader.session.getSnapshot()).toMatchObject({ openState: 'error', loadingOlder: false })
    expect(reader.events.getSnapshot().entries).toHaveLength(2)
    reader.dispose()
  })

  it('cancels once and suppresses pending open completion and publications after disposal', async () => {
    const { reader, stream, publish, fail } = setup()
    const pending = deferred()
    stream.open.mockImplementation(() => pending.promise)
    const observed = vi.fn()
    reader.session.subscribe(observed)
    const opening = reader.session.open()
    await Promise.resolve()
    reader.dispose()
    const calls = observed.mock.calls.length
    publish(page('replace', [1], false))
    fail(new Error('late'))
    pending.resolve()
    await opening
    await reader.session.open()
    await reader.session.loadOlder()
    reader.dispose()
    expect(stream.dispose).toHaveBeenCalledTimes(1)
    expect(observed).toHaveBeenCalledTimes(calls)
    expect(reader.events.getSnapshot().entries).toEqual([])
    expect(stream.prepend).not.toHaveBeenCalled()
  })

  it('does not create a transport when selection is disposed during the loading notification', async () => {
    const { reader, factories } = setup()
    reader.session.subscribe(() => { reader.dispose() })
    await reader.session.open()
    expect(factories.stream).not.toHaveBeenCalled()
  })
})
