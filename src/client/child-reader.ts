/**
 * Read one catalog-addressed child without creating a Session controller or
 * changing the shell's active conversation. Gateway owns cursor repair and
 * cancellation; the public Conversation assembler owns target snapshots.
 * @module @softspark/dsh-process-console/client/child-reader
 */

import {
  MutableSessionEventSource, SessionEventStream,
  type SessionEventStreamOptions, type SessionJournalChange,
} from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionAddress } from '@deepseek-ai/dsh-api-session-controller/types'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import {
  ConversationNodeAssembler,
  type ConversationEventDefinitions, type ConversationSnapshot, type ConversationViewDefinitions,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { TrajectorySnapshot } from '@deepseek-ai/dsh-client-ui-trajectory/client'
import type { ProcessBinding, ProcessSessionSnapshot } from './process-source.ts'

type ChildAddress = Extract<SessionAddress, { kind: 'subagent' }>
type ChildRemote = ConstructorParameters<typeof SessionEventStream>[0]
type ChildStream = Pick<SessionEventStream, 'open' | 'prepend' | 'dispose'>
type ChildAssembler = Pick<ConversationNodeAssembler,
  'activateTarget' | 'replaceWindow' | 'prepend' | 'append' | 'flush' | 'get' | 'activityTargets'>
type ChildEvents = Pick<MutableSessionEventSource, 'getSnapshot' | 'subscribe' | 'replace' | 'prepend' | 'append'>

/** Only a previously validated direct-child catalog entry may supply the address. */
export interface ChildReaderOptions {
  readonly address: ChildAddress
  readonly remote: ChildRemote
  readonly eventDefinitions: ConversationEventDefinitions
  readonly viewDefinitions: ConversationViewDefinitions
  readonly initialRunning?: boolean
}

/** Narrow public constructors, injectable for network-free lifecycle tests. */
export interface ChildReaderFactories {
  readonly stream: (remote: ChildRemote, address: ChildAddress, sinks: SessionEventStreamOptions) => ChildStream
  readonly assembler: (events: ConversationEventDefinitions, views: ConversationViewDefinitions) => ChildAssembler
  readonly events: () => ChildEvents
}

/** A child-owned binding whose disposal never releases an ordinary Session. */
export interface ChildProcessBinding extends ProcessBinding {
  readonly session: ProcessBinding['session'] & { open(): Promise<void> }
  dispose(): void
}

const DEFAULT_FACTORIES: ChildReaderFactories = {
  stream: (remote, address, sinks) => new SessionEventStream(remote, address, sinks),
  assembler: (events, views) => new ConversationNodeAssembler(events, views),
  events: () => new MutableSessionEventSource(),
}

function observable<T>(initial: T): ObservableSnapshot<T> & {
  set(value: T): void
  notify(): void
  clear(): void
} {
  let snapshot = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    set: (value) => { snapshot = value },
    notify: () => { for (const listener of [...listeners]) listener() },
    clear: () => { listeners.clear() },
  }
}

function failureMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error
    && typeof error.code === 'string' && 'message' in error && typeof error.message === 'string') {
    return error.message
  }
  return 'Unable to read the child session.'
}

/** Create an unopened, read-only binding; selecting it may call session.open(). */
export function createChildReader(
  options: ChildReaderOptions,
  factories: ChildReaderFactories = DEFAULT_FACTORIES,
): ChildProcessBinding {
  const assembler = factories.assembler(options.eventDefinitions, options.viewDefinitions)
  assembler.activateTarget('trajectory')
  assembler.activateTarget('process-console')
  const events = factories.events()
  const session = observable<ProcessSessionSnapshot>({
    sessionId: options.address.childSessionId,
    openState: 'cold', openError: null, hasMore: false, loadingOlder: false,
    running: options.initialRunning ?? false,
  })
  const conversation = observable<ConversationSnapshot>({ views: assembler, activeTargets: assembler.activityTargets() })
  const trajectory = observable<TrajectorySnapshot | undefined>(assembler.get('trajectory'))
  let disposed = false
  let terminalFailure = false
  let stream: ChildStream | undefined
  let opening: Promise<void> | undefined
  let paging: Promise<void> | undefined

  const updateSession = (change: Partial<ProcessSessionSnapshot>): void => {
    if (disposed) return
    session.set({ ...session.getSnapshot(), ...change })
    session.notify()
  }

  const fail = (error: unknown): void => {
    if (disposed) return
    terminalFailure = true
    updateSession({ openState: 'error', openError: { message: failureMessage(error) }, loadingOlder: false })
  }

  const accept = (change: SessionJournalChange): void => {
    if (disposed || terminalFailure) return
    switch (change.type) {
      case 'replace':
        assembler.replaceWindow(change.entries, change.hasMore)
        events.replace(change.entries, change.hasMore)
        break
      case 'prepend':
        assembler.prepend(change.entries, change.hasMore)
        events.prepend(change.entries, change.hasMore)
        break
      case 'append':
        assembler.append(change.entry)
        events.append(change.entry)
        break
    }
    if (disposed) return
    assembler.flush()
    // Cache all related values before notifying any view subscriber.
    conversation.set({ views: assembler, activeTargets: assembler.activityTargets() })
    trajectory.set(assembler.get('trajectory'))
    session.set({ ...session.getSnapshot(), hasMore: events.getSnapshot().hasMore })
    conversation.notify()
    trajectory.notify()
    session.notify()
  }

  const open = (): Promise<void> => {
    if (disposed) return Promise.resolve()
    if (opening !== undefined) return opening
    opening = Promise.resolve().then(async () => {
      if (disposed) return
      try {
        stream = factories.stream(options.remote, options.address, { publish: accept, failed: fail })
        await stream.open({})
        if (session.getSnapshot().openState !== 'error') updateSession({ openState: 'open' })
      } catch (error) {
        fail(error)
      }
    })
    updateSession({ openState: 'loading', openError: null })
    return opening
  }

  const loadOlder = (): Promise<void> => {
    if (paging !== undefined) return paging
    const state = session.getSnapshot()
    const beforeSeq = events.getSnapshot().entries[0]?.event.seq
    if (disposed || stream === undefined || state.openState !== 'open' || !state.hasMore || beforeSeq === undefined) {
      return Promise.resolve()
    }
    const current = stream
    paging = Promise.resolve().then(async () => {
      if (disposed) return
      try {
        await current.prepend({ beforeSeq })
      } catch (error) {
        fail(error)
      } finally {
        paging = undefined
        updateSession({ loadingOlder: false })
      }
    })
    updateSession({ loadingOlder: true })
    return paging
  }

  return {
    session: { getSnapshot: session.getSnapshot, subscribe: session.subscribe, open, loadOlder },
    events,
    conversation: { getSnapshot: conversation.getSnapshot, subscribe: conversation.subscribe },
    trajectory: { getSnapshot: trajectory.getSnapshot, subscribe: trajectory.subscribe },
    dispose() {
      if (disposed) return
      disposed = true
      session.clear()
      conversation.clear()
      trajectory.clear()
      void stream?.dispose().catch(() => { /* A disposed reader has no remaining UI owner. */ })
    },
  }
}
