/**
 * Console fold: one conversation snapshot in, one flat list of terminal lines out.
 *
 * The harness object layer already pairs every tool call with its result and
 * assembles streamed assistant text into messages. This module only flattens
 * that structure into the order a terminal would print it and attaches the raw
 * payload to every line so the view can show it verbatim on demand. It is
 * pure and synchronous.
 * @module @softspark/dsh-process-console/client/console-lines
 */

import type {
  AssistantBlock,
  AssistantMessageNode,
  ConversationNode,
  ConversationSnapshot,
  PartialAssistant,
  RunningToolCall,
  ToolCallBlock,
  ToolResultNode,
} from '@deepseek-ai/dsh-client-runtime/client'

/** What a line is, which decides its gutter label and colour. */
export type ConsoleLineKind =
  | 'user'
  | 'context'
  | 'steer'
  | 'assistant'
  | 'reasoning'
  | 'request'
  | 'response'
  | 'running'
  | 'system'
  | 'pending'
  | 'partial'
  | 'error'

/** One printed line of the console. */
export interface ConsoleLine {
  /** Stable identity across re-folds, so React keeps expanded state. */
  readonly key: string
  readonly kind: ConsoleLineKind
  /** Unix epoch milliseconds; `null` when the source carries no time. */
  readonly time: number | null
  /** Short subject: tool name, model, command, form. Empty when there is none. */
  readonly title: string
  /** The body, possibly multi-line. */
  readonly text: string
  /** Secondary facts: elapsed time, usage, call id. */
  readonly detail: string
  readonly isError: boolean
  /** The complete source payload for the raw view. */
  readonly raw: unknown
}

/** Above this many characters a line starts collapsed. */
export const LONG_LINE_CHARS = 1200
/** Above this many rows a line starts collapsed. */
export const LONG_LINE_ROWS = 30

/** The snapshot slice the fold reads. */
export type ConsoleInput = Pick<ConversationSnapshot, 'nodes' | 'partial' | 'runningCalls' | 'pending'>

type Block = { readonly type: string } & Record<string, unknown>

/** Render a content block list the way a terminal would print it. */
export function contentText(blocks: readonly unknown[]): string {
  const parts: string[] = []
  for (const candidate of blocks) {
    const block = candidate as Block
    switch (block.type) {
      case 'text':
        parts.push(String(block.text ?? ''))
        break
      case 'reasoning':
        parts.push(`[reasoning] ${String(block.text ?? '')}`)
        break
      case 'image':
        parts.push('[image]')
        break
      case 'tool-call':
        parts.push(`[tool-call ${String(block.name ?? '')}]`)
        break
      case 'tool-result':
        parts.push(contentText(Array.isArray(block.content) ? block.content : []))
        break
      default:
        parts.push(safeJson(block))
    }
  }
  return parts.join('\n')
}

/** Pretty-print JSON text when it parses, else return it unchanged. */
export function prettyArguments(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

/** `JSON.stringify` that never throws on cycles or bigints. */
export function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, (_key, item: unknown) => (typeof item === 'bigint' ? String(item) : item), 2) ?? String(value)
  } catch {
    return String(value)
  }
}

/** Whether the view should start a line collapsed. */
export function isLong(text: string): boolean {
  if (text.length > LONG_LINE_CHARS) return true
  let rows = 1
  for (let i = 0; i < text.length && rows <= LONG_LINE_ROWS; i++) {
    if (text.charCodeAt(i) === 10) rows++
  }
  return rows > LONG_LINE_ROWS
}

function usageDetail(usage: unknown): string {
  if (usage === null || typeof usage !== 'object') return ''
  const u = usage as Record<string, unknown>
  const pick = (key: string): number | undefined => (typeof u[key] === 'number' ? (u[key] as number) : undefined)
  const input = pick('inputTokens') ?? pick('input')
  const output = pick('outputTokens') ?? pick('output')
  const cached = pick('cacheReadTokens') ?? pick('cacheRead')
  const facts: string[] = []
  if (input !== undefined) facts.push(`in ${input}`)
  if (cached !== undefined && cached > 0) facts.push(`cached ${cached}`)
  if (output !== undefined) facts.push(`out ${output}`)
  return facts.join(' · ')
}

function assistantDetail(node: AssistantMessageNode): string {
  const facts: string[] = [`turn ${node.turn} · step ${node.step}`]
  const timing = node.timing
  if (timing !== undefined && timing.stepStartTime !== null) {
    if (timing.firstTokenTime !== null) facts.push(`ttft ${timing.firstTokenTime - timing.stepStartTime} ms`)
    facts.push(`total ${timing.completedTime - timing.stepStartTime} ms`)
  }
  const usage = usageDetail(node.usage)
  if (usage !== '') facts.push(usage)
  if (node.interrupted === true) facts.push('interrupted')
  return facts.join(' · ')
}

function modelTitle(node: AssistantMessageNode): string {
  const config = node.requestConfig
  if (config !== undefined) {
    const extras: string[] = []
    if (config.thinking !== undefined) extras.push(`thinking=${config.thinking}`)
    if (config.reasoningEffort !== undefined) extras.push(`effort=${config.reasoningEffort}`)
    if (config.temperature !== undefined) extras.push(`t=${config.temperature}`)
    return `${config.provider}/${config.model}${extras.length > 0 ? ` (${extras.join(', ')})` : ''}`
  }
  const provenance = node.provenance
  return provenance === undefined ? '' : `${provenance.provider}/${provenance.model}`
}

function pushAssistantBlocks(
  out: ConsoleLine[],
  keyPrefix: string,
  kind: 'assistant' | 'partial',
  time: number | null,
  blocks: readonly AssistantBlock[],
  title: string,
  detail: string,
  raw: unknown,
): void {
  const text: string[] = []
  let index = 0
  const flushText = (): void => {
    if (text.length === 0) return
    out.push({
      key: `${keyPrefix}:text:${index++}`,
      kind,
      time,
      title,
      text: text.join('\n'),
      detail,
      isError: false,
      raw,
    })
    text.length = 0
  }
  for (const block of blocks) {
    switch (block.kind) {
      case 'text':
        text.push(block.text)
        break
      case 'reasoning':
        flushText()
        out.push({
          key: `${keyPrefix}:reasoning:${index++}`,
          kind: 'reasoning',
          time,
          title,
          text: block.text,
          detail,
          isError: false,
          raw: block,
        })
        break
      case 'tool-call':
        flushText()
        out.push({
          key: `req:${block.callId}`,
          kind: 'request',
          time,
          title: block.name,
          text: prettyArguments(block.argsRaw),
          detail: `call ${block.callId}`,
          isError: false,
          raw: block,
        })
        break
      case 'image':
        text.push('[image]')
        break
      default:
        text.push(safeJson(block))
    }
  }
  flushText()
  if (index === 0) {
    // A message with no printable block still marks that a step completed.
    out.push({ key: `${keyPrefix}:empty`, kind, time, title, text: '', detail, isError: false, raw })
  }
}

function pushToolResult(out: ConsoleLine[], node: ToolResultNode, nested: boolean): void {
  const name = node.call?.name ?? node.callId
  const facts: string[] = [`call ${node.callId}`]
  if (node.callTime !== null) facts.push(`${node.time - node.callTime} ms`)
  if (node.error !== undefined) facts.push(`${node.error.name}/${node.error.code}`)
  out.push({
    key: `res:${node.callId}`,
    kind: 'response',
    time: node.time,
    title: nested ? `↳ ${name}` : name,
    text: contentText(node.content),
    detail: facts.join(' · '),
    isError: node.isError,
    raw: node,
  })
  pushSubCalls(out, node.subCalls)
}

function pushRunning(out: ConsoleLine[], call: RunningToolCall, nested: boolean): void {
  out.push({
    key: `run:${call.callId}`,
    kind: 'running',
    time: call.time,
    title: nested ? `↳ ${call.name}` : call.name,
    text: prettyArguments(call.argsRaw),
    detail: `call ${call.callId} · turn ${call.turn} · step ${call.step}`,
    isError: false,
    raw: call,
  })
  pushSubCalls(out, call.subCalls)
}

function pushSubCalls(out: ConsoleLine[], subCalls: readonly ToolCallBlock[]): void {
  for (const sub of subCalls) {
    if ('kind' in sub) pushToolResult(out, sub, true)
    else pushRunning(out, sub, true)
  }
}

function pushNode(out: ConsoleLine[], node: ConversationNode): void {
  switch (node.kind) {
    case 'user':
      out.push({
        key: `n:${node.seq}`, kind: 'user', time: node.time, title: '',
        text: contentText(node.content), detail: '', isError: false, raw: node,
      })
      return
    case 'steering':
      out.push({
        key: `n:${node.seq}`, kind: 'steer', time: node.time, title: '',
        text: contentText(node.content), detail: '', isError: false, raw: node,
      })
      return
    case 'context':
      out.push({
        key: `n:${node.seq}`, kind: 'context', time: node.time,
        title: node.form ?? '', text: contentText(node.content), detail: '', isError: false, raw: node,
      })
      return
    case 'assistant':
      pushAssistantBlocks(out, `n:${node.seq}`, 'assistant', node.time, node.blocks,
        modelTitle(node), assistantDetail(node), node)
      return
    case 'tool-result':
      pushToolResult(out, node, false)
      return
    case 'model-retry': {
      const retry = node as ConversationNode & { attempt?: unknown; delayMs?: unknown; reason?: unknown }
      const facts: string[] = [node.retryState]
      if (typeof retry.attempt === 'number') facts.push(`attempt ${retry.attempt}`)
      if (typeof retry.delayMs === 'number') facts.push(`delay ${retry.delayMs} ms`)
      out.push({
        key: `n:${node.seq}`, kind: 'system', time: node.time, title: 'model retry',
        text: typeof retry.reason === 'string' ? retry.reason : '', detail: facts.join(' · '), isError: false, raw: node,
      })
      return
    }
    case 'turn-error':
      out.push({
        key: `n:${node.seq}`, kind: 'error', time: node.time, title: node.code ?? 'turn error',
        text: node.message, detail: `turn ${node.turn} · step ${node.step}`, isError: true, raw: node,
      })
      return
    case 'turn-max-tokens':
      out.push({
        key: `n:${node.seq}`, kind: 'error', time: node.time, title: 'max tokens',
        text: 'The model hit its output limit.', detail: `turn ${node.turn} · step ${node.step}`, isError: true, raw: node,
      })
      return
    case 'compaction':
      out.push({
        key: `n:${node.seq}`, kind: 'system', time: node.time, title: 'compaction',
        text: node.summary ?? '',
        detail: [
          node.shadowedItemCount === null ? '' : `${node.shadowedItemCount} items shadowed`,
          node.shadowedTokenCount === null ? '' : `${node.shadowedTokenCount} tokens shadowed`,
        ].filter(Boolean).join(' · '),
        isError: false, raw: node,
      })
      return
    case 'command':
      out.push({
        key: `n:${node.seq}`, kind: 'system', time: node.time,
        title: `/${node.name ?? ''}${node.args === null ? '' : ` ${node.args}`}`,
        text: node.outcome?.text ?? '', detail: node.outcome?.kind ?? 'pending',
        isError: node.outcome?.kind === 'error', raw: node,
      })
      return
    case 'unknown':
      out.push({
        key: `n:${node.seq}`, kind: 'system', time: node.time, title: node.type,
        text: safeJson(node.data), detail: '', isError: false, raw: node,
      })
      return
    default:
      out.push({
        key: `n:${(node as { seq: number }).seq}`, kind: 'system', time: (node as { time: number }).time,
        title: (node as { kind: string }).kind, text: safeJson(node), detail: '', isError: false, raw: node,
      })
  }
}

function pushPartial(out: ConsoleLine[], partial: PartialAssistant): void {
  pushAssistantBlocks(out, 'partial', 'partial', null, partial.blocks, '',
    `turn ${partial.turn} · step ${partial.step}`, partial)
}

function pushPending(out: ConsoleLine[], pending: readonly unknown[]): void {
  for (const [index, wait] of pending.entries()) {
    const facts = wait as { kind?: unknown; id?: unknown; approvalId?: unknown }
    const kind = typeof facts.kind === 'string' ? facts.kind : 'interaction'
    const id = facts.approvalId ?? facts.id
    out.push({
      key: `pending:${String(id ?? index)}`, kind: 'pending', time: null, title: kind,
      text: safeJson(wait), detail: id === undefined ? '' : String(id), isError: false, raw: wait,
    })
  }
}

/**
 * Flatten one snapshot into console lines, oldest first, live state last.
 * @param snapshot - the conversation snapshot slice.
 * @returns the lines to print.
 */
export function foldConsole(snapshot: ConsoleInput): ConsoleLine[] {
  const out: ConsoleLine[] = []
  for (const node of snapshot.nodes) pushNode(out, node)
  for (const call of snapshot.runningCalls) pushRunning(out, call, false)
  if (snapshot.partial !== null) pushPartial(out, snapshot.partial)
  pushPending(out, snapshot.pending)
  return out
}
