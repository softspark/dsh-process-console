/**
 * The Processes tab: a process tree on the left, the selected process's
 * console on the right.
 *
 * Pure presentation. Every live fact arrives through the framework hooks
 * (`useSessions` for the session tree, `useSession` for the root window,
 * `useProcess` for the selected child window) and every gesture leaves
 * through an injected callback. The component holds only view state: filter
 * text, follow-tail, per-line expansion, and which external delegation is
 * selected.
 * @module @softspark/dsh-process-console/client/view
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import css from './ProcessConsoleView.module.css'
import {
  foldConsole, isLong, LONG_LINE_ROWS, safeJson, type ConsoleLine,
} from './console-lines.ts'
import { externalLabel, foldExternal } from './external-lines.ts'
import type { NS } from './locales.ts'
import { buildProcessTree, withExternals, type ProcessRow } from './process-tree.ts'
import type { ProcessSource } from './process-source.ts'
import { EMPTY_PROCESS_CONSOLE_SNAPSHOT, type ExternalProcess } from './stream-definition.ts'

/** The business face `apply` injects into the tab. */
export interface ProcessConsoleInjected {
  /** Bare observable; the renderer binds it to the `useProcess` hook. */
  hooks: { process: ProcessSource }
  select: (id: SessionId) => void
  loadOlder: () => Promise<boolean>
}

/** Complete props of the tab component. */
export type ProcessConsoleViewProps =
  ConvViewProps & InjectFace<ProcessConsoleInjected> & PropsLocale<NS>

const FOLLOW_SLACK_PX = 24
const NO_EXTERNALS: ReadonlyMap<string, ExternalProcess> = EMPTY_PROCESS_CONSOLE_SNAPSHOT.externals

/** `HH:MM:SS.mmm` in the viewer's local time; a blank cell when no time exists. */
export function formatTime(time: number | null): string {
  if (time === null) return ''
  const date = new Date(time)
  const pad = (value: number, width = 2): string => String(value).padStart(width, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
}

/** The first `LONG_LINE_ROWS` rows of a long body plus how many were cut. */
export function truncate(text: string): { head: string; hiddenRows: number } {
  const rows = text.split('\n')
  if (rows.length <= LONG_LINE_ROWS) {
    return { head: text.slice(0, 1200), hiddenRows: 0 }
  }
  return { head: rows.slice(0, LONG_LINE_ROWS).join('\n'), hiddenRows: rows.length - LONG_LINE_ROWS }
}

function matches(line: ConsoleLine, needle: string): boolean {
  if (needle === '') return true
  const haystack = `${line.title}\n${line.detail}\n${line.text}`.toLowerCase()
  return haystack.includes(needle)
}

interface LineRowProps {
  readonly line: ConsoleLine
  readonly rawAll: boolean
  readonly t: ProcessConsoleViewProps['t']
}

function LineRow({ line, rawAll, t }: LineRowProps) {
  const [expanded, setExpanded] = useState(false)
  const [rawOwn, setRawOwn] = useState(false)
  const [copied, setCopied] = useState(false)
  const long = isLong(line.text)
  const shown = long && !expanded ? truncate(line.text) : { head: line.text, hiddenRows: 0 }
  const raw = rawAll || rawOwn

  const copy = useCallback(() => {
    const payload = line.text === '' ? safeJson(line.raw) : line.text
    const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard
    if (clipboard === undefined) return
    void clipboard.writeText(payload).then(() => {
      setCopied(true)
      setTimeout(() => { setCopied(false) }, 1200)
    }).catch(() => {
      // The browser refused; nothing to report in a console row.
    })
  }, [line.raw, line.text])

  return (
    <div className={css.line} data-kind={line.kind} data-error={line.isError ? 'true' : undefined} role="row">
      <span className={css.time}>{formatTime(line.time)}</span>
      <span className={css.kind}>{t(`line.${line.kind}`)}</span>
      <div className={css.body}>
        {(line.title !== '' || line.detail !== '') && (
          <div className={css.meta}>
            {line.title !== '' && <span className={css.title}>{line.title}</span>}
            {line.detail !== '' && <span className={css.detail}>{line.detail}</span>}
          </div>
        )}
        {shown.head !== '' && <pre className={css.text}>{shown.head}</pre>}
        {long && (
          <button type="button" className={css.more} onClick={() => { setExpanded(value => !value) }}>
            {expanded ? t('console.showLess') : `${t('console.showMore')} (+${shown.hiddenRows || 1})`}
          </button>
        )}
        {raw && <pre className={css.raw}>{safeJson(line.raw)}</pre>}
      </div>
      <div className={css.actions}>
        <button type="button" className={css.action} onClick={copy}>
          {copied ? t('console.copied') : t('console.copy')}
        </button>
        <button
          type="button"
          className={css.action}
          aria-pressed={raw}
          disabled={rawAll}
          onClick={() => { setRawOwn(value => !value) }}
        >
          {t('console.raw')}
        </button>
      </div>
    </div>
  )
}

interface TreeProps {
  readonly rows: readonly ProcessRow[]
  readonly selected: string | null
  readonly onSelect: (row: ProcessRow) => void
  readonly t: ProcessConsoleViewProps['t']
}

function ProcessTree({ rows, selected, onSelect, t }: TreeProps) {
  return (
    <nav className={css.tree} aria-label={t('tree.title')}>
      <div className={css.treeTitle}>{t('tree.title')}</div>
      {rows.map(row => (
        <button
          type="button"
          key={row.id}
          className={css.treeRow}
          aria-current={row.id === selected ? 'true' : undefined}
          style={{ paddingLeft: 12 + row.depth * 14 }}
          title={row.kind === 'session'
            ? `${row.id}${row.agentPreset === undefined ? '' : ` · ${row.agentPreset}`}`
            : `${row.id} · ${row.provider}`}
          onClick={() => { onSelect(row) }}
        >
          <span className={css.treeDot} data-running={row.running ? 'true' : 'false'} />
          <span className={css.treeLabel}>
            {row.kind === 'session' && row.depth === 0 ? `${t('tree.main')} · ${row.label}` : row.label}
          </span>
          <span className={css.treeBadge}>
            {row.kind === 'external'
              ? `${t('tree.delegation')} · ${row.running ? t('tree.running') : t('tree.done')}`
              : row.running ? t('tree.running') : t('tree.idle')}
          </span>
        </button>
      ))}
    </nav>
  )
}

export function ProcessConsoleView({
  sessionId, useSession, useSessions, useProcess, select, loadOlder, t,
}: ProcessConsoleViewProps) {
  const ids = useSessions(state => state.ids)
  const byId = useSessions(state => state.byId)
  const rootExternals = useSession(state => state.views.get('process-console')?.externals ?? NO_EXTERNALS)
  const process = useProcess(state => state)
  const entries = useMemo(() => buildProcessTree({ ids, byId }, sessionId), [ids, byId, sessionId])

  const [filter, setFilter] = useState('')
  const [follow, setFollow] = useState(true)
  const [rawAll, setRawAll] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [externalSelected, setExternalSelected] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement | null>(null)

  const selectedSession = process.selected ?? sessionId
  const conversation = process.conversation
  const childExternals = conversation?.views.get('process-console')?.externals

  const externalsByParent = useMemo(() => {
    const map = new Map<SessionId, ReadonlyMap<string, ExternalProcess>>()
    map.set(sessionId, rootExternals)
    if (selectedSession !== sessionId && childExternals !== undefined) map.set(selectedSession, childExternals)
    return map
  }, [sessionId, rootExternals, selectedSession, childExternals])
  const rows = useMemo(() => withExternals(entries, externalsByParent, externalLabel), [entries, externalsByParent])

  // A child that left the tree (removed, or the root changed) falls back to the root.
  useEffect(() => {
    if (!entries.some(entry => entry.id === selectedSession)) select(sessionId)
  }, [entries, selectedSession, select, sessionId])
  const externalRow = externalSelected === null
    ? undefined
    : rows.find((row): row is Extract<ProcessRow, { kind: 'external' }> => row.kind === 'external' && row.id === externalSelected)
  useEffect(() => {
    if (externalSelected !== null && externalRow === undefined) setExternalSelected(null)
  }, [externalSelected, externalRow])

  const lines = useMemo(() => {
    if (externalRow !== undefined) return foldExternal(externalRow.process)
    return conversation === null ? [] : foldConsole(conversation)
  }, [externalRow, conversation])
  const needle = filter.trim().toLowerCase()
  const visible = useMemo(() => lines.filter(line => matches(line, needle)), [lines, needle])

  const selectedId = externalRow?.id ?? selectedSession
  const lastKey = visible[visible.length - 1]?.key
  useEffect(() => {
    const element = scroller.current
    if (element === null || !follow) return
    element.scrollTop = element.scrollHeight
  }, [follow, lastKey, visible.length, selectedId])

  const onScroll = useCallback(() => {
    const element = scroller.current
    if (element === null) return
    const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight <= FOLLOW_SLACK_PX
    setFollow(atBottom)
  }, [])

  const onSelectRow = useCallback((row: ProcessRow) => {
    if (row.kind === 'session') {
      setExternalSelected(null)
      select(row.id)
    } else {
      setExternalSelected(row.id)
    }
    setFollow(true)
  }, [select])

  const onLoadOlder = useCallback(() => {
    setLoadingOlder(true)
    setFollow(false)
    void loadOlder().finally(() => { setLoadingOlder(false) })
  }, [loadOlder])

  const current = rows.find(row => row.id === selectedId)
  const openState = conversation?.openState
  let status: { text: string; error: boolean } | null = null
  if (externalRow !== undefined) {
    if (visible.length === 0) status = { text: t('console.empty'), error: false }
  } else if (process.status === 'unavailable') status = { text: t('console.unavailable'), error: true }
  else if (conversation === null || openState === 'cold') status = { text: t('console.cold'), error: false }
  else if (openState === 'loading') status = { text: t('console.loading'), error: false }
  else if (openState === 'error') {
    const message = conversation.openError?.message
    status = { text: message === undefined ? t('console.error') : `${t('console.openError')}: ${message}`, error: true }
  } else if (visible.length === 0) status = { text: t('console.empty'), error: false }

  const stateLabel = current === undefined
    ? t('tree.idle')
    : current.kind === 'external'
      ? (current.running ? t('tree.running') : t('tree.done'))
      : (current.running ? t('tree.running') : t('tree.idle'))

  return (
    <div className={css.root}>
      <ProcessTree rows={rows} selected={selectedId} onSelect={onSelectRow} t={t} />
      <section className={css.pane} aria-label={current?.label ?? String(selectedId)}>
        <div className={css.toolbar}>
          <span className={css.toolbarTitle}>{current?.label ?? String(selectedId)}</span>
          <span className={css.toolbarState}>
            {stateLabel}
            {visible.length !== lines.length ? ` · ${visible.length}/${lines.length}` : ` · ${lines.length}`}
          </span>
          <input
            className={css.filter}
            type="search"
            value={filter}
            placeholder={t('console.filter')}
            aria-label={t('console.filter')}
            onChange={event => { setFilter(event.target.value) }}
          />
          <button
            type="button"
            className={css.toggle}
            disabled={externalRow !== undefined || conversation?.hasMore !== true || loadingOlder}
            onClick={onLoadOlder}
          >
            {loadingOlder ? t('console.loadingOlder') : t('console.loadOlder')}
          </button>
          <button
            type="button"
            className={css.toggle}
            aria-pressed={rawAll}
            onClick={() => { setRawAll(value => !value) }}
          >
            {t('console.raw')}
          </button>
          <button
            type="button"
            className={css.toggle}
            aria-pressed={follow}
            onClick={() => { setFollow(value => !value) }}
          >
            {t('console.follow')}
          </button>
        </div>
        <div className={css.lines} ref={scroller} onScroll={onScroll} role="table" aria-label={t('view.processes')}>
          {status !== null && <div className={css.status} data-error={status.error ? 'true' : undefined}>{status.text}</div>}
          {visible.map(line => <LineRow key={line.key} line={line} rawAll={rawAll} t={t} />)}
        </div>
      </section>
    </div>
  )
}
