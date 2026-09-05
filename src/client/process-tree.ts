/**
 * Process tree: the current session and every session-backed subagent under it.
 *
 * A pure fold over the harness session list. The host lists subagent sessions
 * with `parentId` set to the delegating session, so the tree is the transitive
 * closure of that relation from the current session down. Nothing here touches
 * the network or a Session window.
 * @module @softspark/dsh-process-console/client/process-tree
 */

import type { SessionId, SessionListState } from '@deepseek-ai/dsh-client-runtime/client'

/** One row of the process tree. */
export interface ProcessEntry {
  readonly id: SessionId
  /** Direct parent; `null` for the root. */
  readonly parentId: SessionId | null
  /** Distance from the root; the root is 0. */
  readonly depth: number
  /** Human-facing label as the host projects it. */
  readonly label: string
  readonly running: boolean
  readonly agentPreset: string | undefined
  /** Whether the host marked this session as a subagent-origin session. */
  readonly subagent: boolean
}

/** The slice of the session list the tree reads. */
export type ProcessTreeInput = Pick<SessionListState, 'ids' | 'byId'>

/**
 * Build the depth-first process tree rooted at `rootId`.
 *
 * Children keep the host list order. A session that is not reachable from the
 * root is not a process of this conversation and is left out; a cycle in the
 * parent relation (impossible on a healthy host, cheap to guard) is cut at the
 * first repeated id.
 * @param list - session list slice.
 * @param rootId - the conversation whose processes are listed.
 * @returns the root followed by its descendants in depth-first order.
 */
export function buildProcessTree(list: ProcessTreeInput, rootId: SessionId): ProcessEntry[] {
  const childrenOf = new Map<SessionId, SessionId[]>()
  for (const id of list.ids) {
    const parent = list.byId[id]?.parentId
    if (parent === undefined) continue
    const siblings = childrenOf.get(parent)
    if (siblings === undefined) childrenOf.set(parent, [id])
    else siblings.push(id)
  }

  const out: ProcessEntry[] = []
  const seen = new Set<SessionId>()
  const visit = (id: SessionId, parentId: SessionId | null, depth: number): void => {
    if (seen.has(id)) return
    seen.add(id)
    const summary = list.byId[id]
    out.push({
      id,
      parentId,
      depth,
      label: summary?.displayTitle ?? String(id),
      running: summary?.running ?? false,
      agentPreset: summary?.agentPreset,
      subagent: summary?.origin === 'subagent',
    })
    for (const child of childrenOf.get(id) ?? []) visit(child, id, depth + 1)
  }
  visit(rootId, null, 0)
  return out
}
