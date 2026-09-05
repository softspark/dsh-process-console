/**
 * The one reactive fact this package owns: which process is selected and what
 * its conversation window currently holds.
 *
 * Lives in the object layer (React-free) and reaches the component through the
 * renderer-bound `useProcess` hook. Switching processes re-targets the single
 * subscription; a cold child window is opened through the concrete session's
 * `open()`, which the public face does not declare, so its presence is checked
 * at runtime and its absence is reported instead of rendering an empty pane.
 * @module @softspark/dsh-process-console/client/process-source
 */

import type {
  ConversationSnapshot,
  ObservableSnapshot,
  SessionFace,
  SessionId,
} from '@deepseek-ai/dsh-client-runtime/client'

/** Whether the selected process can be read at all. */
export type ProcessStatus = 'idle' | 'unavailable' | 'live'

/** The published snapshot. */
export interface ProcessSnapshot {
  readonly selected: SessionId | null
  readonly status: ProcessStatus
  /** The selected session's window; `null` until one is bound. */
  readonly conversation: ConversationSnapshot | null
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
export type ResolveSession = (id: SessionId) => SessionFace | undefined

const IDLE: ProcessSnapshot = { selected: null, status: 'idle', conversation: null }

type Openable = { open?: unknown }

/**
 * Open a window the runtime has not staged yet. The concrete Session exposes
 * `open()`; the face does not. A face without it cannot be read, so the
 * caller reports that state rather than pretending the log is empty.
 * @param face - the resolved session face.
 * @returns `true` when the window is open or opening.
 */
export function ensureOpen(face: SessionFace): boolean {
  if (face.getSnapshot().openState !== 'cold') return true
  const open = (face as unknown as Openable).open
  if (typeof open !== 'function') return false
  void Promise.resolve((open as () => unknown).call(face)).catch(() => {
    // The window publishes its own `openError`; nothing to add here.
  })
  return true
}

/**
 * Create the process source.
 * @param resolve - session lookup, normally `ctx.sessions.binding(id)?.session`.
 * @returns the source.
 */
export function createProcessSource(resolve: ResolveSession): ProcessSource {
  const listeners = new Set<() => void>()
  let snapshot: ProcessSnapshot = IDLE
  let face: SessionFace | undefined
  let unsubscribe: (() => void) | undefined

  const publish = (next: ProcessSnapshot): void => {
    snapshot = next
    for (const listener of listeners) listener()
  }

  const detach = (): void => {
    unsubscribe?.()
    unsubscribe = undefined
    face = undefined
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
      if (next === undefined || !ensureOpen(next)) {
        publish({ selected: id, status: 'unavailable', conversation: null })
        return
      }
      face = next
      unsubscribe = next.subscribe(() => {
        if (face !== next) return
        publish({ selected: id, status: 'live', conversation: next.getSnapshot() })
      })
      publish({ selected: id, status: 'live', conversation: next.getSnapshot() })
    },
    async loadOlder() {
      const current = face
      if (current === undefined) return false
      const before = current.getSnapshot().nodes
      await current.loadOlder()
      return current.getSnapshot().nodes !== before
    },
    dispose() {
      detach()
      listeners.clear()
      snapshot = IDLE
    },
  }
}
