/**
 * The one reactive fact this package owns: which process is selected and what
 * its session, trajectory target, and pending interaction currently hold.
 *
 * Lives in the object layer (React-free) and reaches the component through the
 * renderer-bound `useProcess` hook. Switching processes re-targets the single
 * subscription; a cold child window is opened through the concrete session's
 * `open()`, which the public face does not declare, so its presence is checked
 * at runtime and its absence is reported instead of rendering an empty pane.
 * @module @softspark/dsh-process-console/client/process-source
 */

import type { SessionEventSource, SessionSnapshot } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { TrajectorySnapshot } from '@deepseek-ai/dsh-client-ui-trajectory/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Whether the selected process can be read at all. */
export type ProcessStatus = 'idle' | 'unavailable' | 'live'

/** Read-only lifecycle facts needed by the console, without command methods. */
export interface ProcessSessionSnapshot extends Pick<SessionSnapshot, 'sessionId' | 'openState' | 'hasMore' | 'loadingOlder' | 'running'> {
  readonly openError: { readonly message: string } | null
}

/** The console's read model assembled from the public DSH sources. */
export interface ProcessConversationSnapshot extends ProcessSessionSnapshot, ConversationSnapshot {
  readonly nodes: TrajectorySnapshot['eventNodes']
  readonly partial: TrajectorySnapshot['partial']
  readonly runningCalls: TrajectorySnapshot['runningCalls']
  readonly pending: readonly unknown[]
}

/** A resolved controller binding and its independently activated trajectory. */
export interface ProcessBinding {
  readonly session: ObservableSnapshot<ProcessSessionSnapshot> & { loadOlder(): Promise<void> }
  readonly events: SessionEventSource
  readonly conversation: ObservableSnapshot<ConversationSnapshot>
  readonly trajectory: ObservableSnapshot<TrajectorySnapshot | undefined>
  /** Present only for a reader owned by this plugin, never for controller bindings. */
  readonly dispose?: () => void
}

/** The published snapshot. */
export interface ProcessSnapshot {
  readonly selected: SessionId | null
  readonly status: ProcessStatus
  /** The selected session's window; `null` until one is bound. */
  readonly conversation: ProcessConversationSnapshot | null
}

/** The observable plus the two gestures the view may perform. */
export interface ProcessSource extends ObservableSnapshot<ProcessSnapshot> {
  /** Point the console at `id`; a repeat of the current id is a no-op. */
  select(id: SessionId): void
  /** Page one older slice into the selected window; resolves `true` when it grew. */
  loadOlder(): Promise<boolean>
  /** Drop the subscription and listeners. */
  dispose(): void
}

/** Resolve a session face by id; `undefined` when the runtime has no such scope. */
export type ResolveSession = (id: SessionId) => ProcessBinding | undefined

const IDLE: ProcessSnapshot = { selected: null, status: 'idle', conversation: null }

type Openable = { open?: unknown }

/**
 * Open a window the runtime has not staged yet. The concrete Session exposes
 * `open()`; the face does not. A face without it cannot be read, so the
 * caller reports that state rather than pretending the log is empty.
 * @param face - the resolved session face.
 * @returns `true` when the window is open or opening.
 */
export function ensureOpen(face: ProcessBinding['session']): boolean {
  if (face.getSnapshot().openState !== 'cold') return true
  const open = (face as unknown as Openable).open
  if (typeof open !== 'function') return false
  try {
    void Promise.resolve((open as () => unknown).call(face)).catch(() => {
      // The window publishes its own `openError`; nothing to add here.
    })
  } catch {
    return false
  }
  return true
}

function readProcess(
  id: SessionId,
  binding: ProcessBinding,
  pendingInteractions: ObservableSnapshot<ReadonlyMap<SessionId, unknown>>,
): ProcessSnapshot {
  const trajectory = binding.trajectory.getSnapshot()
  if (trajectory === undefined) return { selected: id, status: 'unavailable', conversation: null }
  const pending = pendingInteractions.getSnapshot().get(id)
  return {
    selected: id,
    status: 'live',
    conversation: {
      ...binding.session.getSnapshot(),
      ...binding.conversation.getSnapshot(),
      nodes: trajectory.eventNodes,
      partial: trajectory.partial,
      runningCalls: trajectory.runningCalls,
      pending: pending === undefined ? [] : [pending],
    },
  }
}

/**
 * Create the process source.
 * @param resolve - controller binding plus `ctx.uiConversation.binding(binding).target('trajectory')`.
 * @param pendingInteractions - `ctx.uiSession.pendingInteractions`.
 * @returns the source.
 */
export function createProcessSource(
  resolve: ResolveSession,
  pendingInteractions: ObservableSnapshot<ReadonlyMap<SessionId, unknown>>,
): ProcessSource {
  const listeners = new Set<() => void>()
  let snapshot: ProcessSnapshot = IDLE
  let binding: ProcessBinding | undefined
  let unsubscribers: (() => void)[] = []
  let generation = 0

  const publish = (next: ProcessSnapshot): void => {
    snapshot = next
    for (const listener of listeners) listener()
  }

  const detach = (): void => {
    generation++
    const previous = binding
    binding = undefined
    for (const unsubscribe of unsubscribers) unsubscribe()
    unsubscribers = []
    previous?.dispose?.()
  }

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    select(id) {
      if (snapshot.selected === id && snapshot.status !== 'unavailable') return
      detach()
      const next = resolve(id)
      if (next === undefined || !ensureOpen(next.session)) {
        next?.dispose?.()
        publish({ selected: id, status: 'unavailable', conversation: null })
        return
      }
      binding = next
      const selectedGeneration = generation
      const refresh = (): void => {
        if (binding === next && generation === selectedGeneration) {
          publish(readProcess(id, next, pendingInteractions))
        }
      }
      for (const source of [next.session, next.conversation, next.trajectory, pendingInteractions]) {
        const unsubscribe = source.subscribe(refresh)
        if (binding !== next || generation !== selectedGeneration) {
          unsubscribe()
          return
        }
        unsubscribers.push(unsubscribe)
      }
      refresh()
    },
    async loadOlder() {
      const current = binding
      if (current === undefined) return false
      const selectedGeneration = generation
      const before = current.events.getSnapshot().revision
      await current.session.loadOlder()
      return binding === current && generation === selectedGeneration
        && current.events.getSnapshot().revision !== before
    },
    dispose() {
      detach()
      listeners.clear()
      snapshot = IDLE
    },
  }
}
