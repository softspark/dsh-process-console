/**
 * External delegations as processes: the `subagent/stream` event fold.
 *
 * A one-shot out-of-process child (Claude Code, an ACP agent) has no session
 * of its own; a patched provider appends its steps to the delegating parent's
 * log as ignorable `subagent/stream` events. This module turns those events
 * into one record per child through the harness's own conversation
 * Definition and view-target machinery, so the fold is incremental and lives
 * in the shared Session window like every other view. An unpatched harness
 * writes no such events and this module simply contributes nothing.
 * @module @softspark/dsh-process-console/client/stream-definition
 */

import type {
  ConversationMatch,
  ConversationNodeContext,
  ConversationNodeDefinition,
  ConversationTimelineSnapshot,
  ConversationViewBuilder,
  ConversationViewDefinition,
  ConversationViewNode,
} from '@deepseek-ai/dsh-client-runtime/client'

/** The event type the patched providers append. */
export const STREAM_EVENT_TYPE = 'subagent/stream'
/** The view target this package registers. */
export const PROCESS_CONSOLE_TARGET = 'process-console'
/** The Definition kind. */
export const STREAM_NODE_KIND = 'process-console-stream'

/** Provider-neutral step vocabulary, mirrored from `@deepseek-ai/dsh-subagent`. */
export type ExternalStepKind =
  | 'system'
  | 'assistant'
  | 'thought'
  | 'tool-call'
  | 'tool-result'
  | 'result'
  | 'plan'
  | 'other'

/** One step of an external child as it appears in the parent log. */
export interface ExternalStep {
  readonly seq: number
  readonly time: number
  readonly index: number
  readonly kind: ExternalStepKind
  readonly text: string
  readonly name: string | undefined
  readonly callId: string | undefined
  readonly isError: boolean
  readonly meta: unknown
  readonly truncated: boolean
}

/** One external child, folded from its stream events. */
export interface ExternalProcess {
  readonly childId: string
  readonly provider: string
  readonly firstSeq: number
  readonly firstTime: number
  readonly lastTime: number
  readonly steps: readonly ExternalStep[]
  /** The child reported its terminal result. */
  readonly done: boolean
}

/** The snapshot published under the `process-console` view target. */
export interface ProcessConsoleViewSnapshot {
  /** External children keyed by child id, in first-seen order. */
  readonly externals: ReadonlyMap<string, ExternalProcess>
}

declare module '@deepseek-ai/dsh-client-runtime/client' {
  interface ConversationViewSnapshotMap {
    /** External delegations folded from `subagent/stream` events. */
    'process-console': ProcessConsoleViewSnapshot
  }
}

/** Stable empty snapshot. */
export const EMPTY_PROCESS_CONSOLE_SNAPSHOT: ProcessConsoleViewSnapshot = { externals: new Map() }

const STEP_KINDS: ReadonlySet<string> = new Set<ExternalStepKind>([
  'system', 'assistant', 'thought', 'tool-call', 'tool-result', 'result', 'plan', 'other',
])

interface StreamEventData {
  readonly childId: string
  readonly provider: string
  readonly index: number
  readonly item: {
    readonly kind: ExternalStepKind
    readonly text?: string
    readonly name?: string
    readonly callId?: string
    readonly isError?: boolean
    readonly meta?: unknown
  }
  readonly truncated?: true
}

/**
 * Narrow one event payload to the stream shape; anything else is not ours.
 * @param data - the event data.
 * @returns the typed data, or `undefined`.
 */
export function readStreamData(data: unknown): StreamEventData | undefined {
  if (typeof data !== 'object' || data === null) return undefined
  const record = data as Record<string, unknown>
  const item = record['item']
  if (typeof record['childId'] !== 'string' || typeof record['provider'] !== 'string') return undefined
  if (typeof record['index'] !== 'number' || typeof item !== 'object' || item === null) return undefined
  const kind = (item as Record<string, unknown>)['kind']
  if (typeof kind !== 'string' || !STEP_KINDS.has(kind)) return undefined
  return record as unknown as StreamEventData
}

function stepFrom(match: ConversationMatch, data: StreamEventData): ExternalStep {
  const item = data.item
  return {
    seq: match.event.seq,
    time: match.event.time,
    index: data.index,
    kind: item.kind,
    text: typeof item.text === 'string' ? item.text : '',
    name: typeof item.name === 'string' ? item.name : undefined,
    callId: typeof item.callId === 'string' ? item.callId : undefined,
    isError: item.isError === true,
    meta: item.meta,
    truncated: data.truncated === true,
  }
}

function processFrom(match: ConversationMatch, data: StreamEventData): ExternalProcess {
  const step = stepFrom(match, data)
  return {
    childId: data.childId,
    provider: data.provider,
    firstSeq: match.event.seq,
    firstTime: match.event.time,
    lastTime: match.event.time,
    steps: [step],
    done: step.kind === 'result',
  }
}

function appendStep(state: ExternalProcess, match: ConversationMatch, data: StreamEventData): ExternalProcess {
  const step = stepFrom(match, data)
  return {
    ...state,
    lastTime: match.event.time,
    steps: [...state.steps, step],
    done: state.done || step.kind === 'result',
  }
}

/** The view node this Definition publishes. */
export interface ProcessConsoleViewNode extends ConversationViewNode {
  readonly target: typeof PROCESS_CONSOLE_TARGET
  readonly data: ExternalProcess
}

/**
 * One Definition per child id: the child's first event starts the record,
 * every later event of the same child updates it.
 */
export const streamNodeDefinition: ConversationNodeDefinition<ExternalProcess> = {
  kind: STREAM_NODE_KIND,
  target: PROCESS_CONSOLE_TARGET,
  match: (event) => {
    // The client's event union does not carry the provider-declared type, so
    // the comparison goes through the loose envelope on purpose.
    const envelope = event as unknown as { readonly type: string; readonly data: unknown }
    if (envelope.type !== STREAM_EVENT_TYPE) return null
    const data = readStreamData(envelope.data)
    if (data === undefined) return null
    return { id: data.childId, role: data.index === 0 ? 'start' : 'update' }
  },
  start: (_context, match) => {
    const data = readStreamData(match.event.data)
    if (data === undefined) throw new Error('process-console: stream start without stream data')
    return processFrom(match, data)
  },
  update: (context, match) => {
    const data = readStreamData(match.event.data)
    return data === undefined ? context.state : appendStep(context.state, match, data)
  },
  buildViewNode: (context: ConversationNodeContext<ExternalProcess>) => (context.state === undefined
    ? null
    : {
      key: context.key,
      kind: context.kind,
      id: context.id,
      target: PROCESS_CONSOLE_TARGET,
      data: context.state,
    } satisfies ProcessConsoleViewNode),
}

/** Incremental builder of the `process-console` target snapshot. */
export class ProcessConsoleViewBuilder implements ConversationViewBuilder<ProcessConsoleViewNode, ProcessConsoleViewSnapshot> {
  readonly empty = EMPTY_PROCESS_CONSOLE_SNAPSHOT
  private externals = new Map<string, ExternalProcess>()

  replace(input: {
    readonly nodes: readonly ProcessConsoleViewNode[]
    readonly timeline?: ConversationTimelineSnapshot
  }): ProcessConsoleViewSnapshot {
    this.externals = new Map()
    return this.apply({ upserts: input.nodes })
  }

  apply(input: {
    readonly upserts: readonly ProcessConsoleViewNode[]
    readonly timeline?: ConversationTimelineSnapshot
  }): ProcessConsoleViewSnapshot {
    const next = new Map(this.externals)
    for (const node of input.upserts) {
      if (node.target !== PROCESS_CONSOLE_TARGET) continue
      next.set(node.data.childId, node.data)
    }
    this.externals = new Map([...next.entries()].sort((left, right) => left[1].firstSeq - right[1].firstSeq))
    return { externals: this.externals }
  }
}

/** The view target factory. */
export const processConsoleViewDefinition: ConversationViewDefinition<ProcessConsoleViewNode, ProcessConsoleViewSnapshot> = {
  target: PROCESS_CONSOLE_TARGET,
  create: () => new ProcessConsoleViewBuilder(),
}
