/**
 * Process tree: the current session and every session-backed subagent under it.
 *
 * A pure fold over the harness session list. The host lists subagent sessions
 * with `parentId` set to the delegating session, so the tree is the transitive
 * closure of that relation from the current session down. Nothing here touches
 * the network or a Session window.
 * @module @softspark/dsh-process-console/client/process-tree
 */

import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ExternalProcess } from './stream-definition.ts'

/** A row for an out-of-process delegation folded from the parent's log. */
export interface ExternalEntry {
  readonly kind: 'external'
  readonly id: string
  readonly parentId: SessionId
  readonly depth: number
  readonly label: string
  readonly running: boolean
  readonly provider: string
  readonly process: ExternalProcess
}

/** Any row of the process tree. */
export type ProcessRow = (ProcessEntry & { readonly kind: 'session' }) | ExternalEntry

/**
 * Place each parent's external delegations directly under that parent's row.
 * @param entries - session rows from {@link buildProcessTree}.
 * @param externalsByParent - folded delegations keyed by the session whose log holds them.
 * @param label - renders one row label.
 * @returns the mixed rows, sessions first within each parent.
 */
export function withExternals(
  entries: readonly ProcessEntry[],
  externalsByParent: ReadonlyMap<SessionId, ReadonlyMap<string, ExternalProcess>>,
  label: (process: ExternalProcess) => string,
): ProcessRow[] {
  const rows: ProcessRow[] = []
  for (const entry of entries) {
    rows.push({ ...entry, kind: 'session' })
    for (const process of externalsByParent.get(entry.id)?.values() ?? []) {
      rows.push({
        kind: 'external',
        id: process.childId,
        parentId: entry.id,
        depth: entry.depth + 1,
        label: label(process),
        running: !process.done,
        provider: process.provider,
        process,
      })
    }
  }
  return rows
}

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
export type ProcessTreeInput = Pick<SessionListState, 'ids' | 'byId'> & Partial<Pick<SessionListState, 'subagentsByParent'>>

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
  // DSH 0.1.2 keeps catalog-only children outside the global list. Include
  // diagnostics too, so an unreadable child remains selectable and explicit.
  const catalogRows = new Map<SessionId, { label: string; running: boolean }>()
  for (const [parent, catalog] of Object.entries(list.subagentsByParent ?? {})) {
    const parentId = parent as SessionId
    const children = childrenOf.get(parentId) ?? []
    for (const entry of catalog.entries) {
      if (!children.includes(entry.id)) children.push(entry.id)
      catalogRows.set(entry.id, {
        label: entry.kind === 'child' ? entry.label ?? String(entry.id) : String(entry.id),
        running: entry.kind === 'child' && entry.activity === 'running',
      })
    }
    childrenOf.set(parentId, children)
  }

  const out: ProcessEntry[] = []
  const seen = new Set<SessionId>()
  const visit = (id: SessionId, parentId: SessionId | null, depth: number): void => {
    if (seen.has(id)) return
    seen.add(id)
    const summary = list.byId[id]
    const catalog = catalogRows.get(id)
    const preset = (summary?.projectionValues as Readonly<Record<string, unknown>> | undefined)?.agentPreset
    out.push({
      id,
      parentId,
      depth,
      label: summary?.displayTitle ?? catalog?.label ?? String(id),
      running: catalog?.running ?? summary?.running ?? false,
      agentPreset: typeof preset === 'string' ? preset : undefined,
      subagent: summary?.origin === 'subagent' || catalog !== undefined,
    })
    for (const child of childrenOf.get(id) ?? []) visit(child, id, depth + 1)
  }
  visit(rootId, null, 0)
  return out
}
