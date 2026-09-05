/**
 * Console fold for an external child: its stream steps in, console lines out.
 * @module @softspark/dsh-process-console/client/external-lines
 */

import { prettyArguments, safeJson, type ConsoleLine, type ConsoleLineKind } from './console-lines.ts'
import type { ExternalProcess, ExternalStep } from './stream-definition.ts'

function kindOf(step: ExternalStep): ConsoleLineKind {
  switch (step.kind) {
    case 'assistant': return 'assistant'
    case 'thought': return 'reasoning'
    case 'tool-call': return 'request'
    case 'tool-result': return 'response'
    case 'result': return step.isError ? 'error' : 'system'
    default: return step.isError ? 'error' : 'system'
  }
}

function metaDetail(meta: unknown): string {
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) return ''
  const facts: string[] = []
  for (const [key, value] of Object.entries(meta as Record<string, unknown>)) {
    if (value === null || value === undefined) continue
    if (typeof value === 'object') continue
    facts.push(`${key} ${String(value)}`)
  }
  return facts.join(' · ')
}

/**
 * Print one external child's steps as console lines, oldest first.
 * @param process - the folded child.
 * @returns the lines.
 */
export function foldExternal(process: ExternalProcess): ConsoleLine[] {
  const callTimes = new Map<string, number>()
  const out: ConsoleLine[] = []
  for (const step of process.steps) {
    const kind = kindOf(step)
    const facts: string[] = []
    if (step.callId !== undefined) facts.push(`call ${step.callId}`)
    if (step.kind === 'tool-call' && step.callId !== undefined) callTimes.set(step.callId, step.time)
    if (step.kind === 'tool-result' && step.callId !== undefined) {
      const started = callTimes.get(step.callId)
      if (started !== undefined) facts.push(`${step.time - started} ms`)
    }
    const meta = metaDetail(step.meta)
    if (meta !== '') facts.push(meta)
    if (step.truncated) facts.push('truncated')
    let title = step.name ?? ''
    if (title === '' && (step.kind === 'result' || step.kind === 'plan' || step.kind === 'system')) title = step.kind
    out.push({
      key: `x:${process.childId}:${step.index}`,
      kind,
      time: step.time,
      title,
      text: step.kind === 'tool-call' ? prettyArguments(step.text) : step.text,
      detail: facts.join(' · '),
      isError: step.isError,
      raw: step.meta === undefined && step.text !== '' ? step : { ...step, meta: step.meta ?? null },
    })
  }
  return out
}

/** A short human label for the tree row. */
export function externalLabel(process: ExternalProcess): string {
  return `${process.provider} · ${process.childId.slice(0, 8)}`
}

/** The raw payload of a whole external child, for the copy action. */
export function externalRaw(process: ExternalProcess): string {
  return safeJson(process)
}
