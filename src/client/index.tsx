/**
 * Process-console plugin, browser half.
 *
 * Registers one tab, Processes, in the conversation view ring next to Chat and
 * Trajectory. The tab lists the current session and every session-backed
 * subagent under it, and prints the selected one as a live console. Composing
 * this row out of a profile removes the tab and nothing else.
 * @module @softspark/dsh-process-console/client
 */

import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-commands/remote'
// Type-only: pulls `ctx.locale`.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the 'conversation.view' SlotMap row, declared by ui-conversation,
// must be in the program for the register call to type.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { en, NS, zh, type ProcessConsoleKey } from './locales.ts'
import { createProcessSource, type ProcessBinding, type ProcessSource } from './process-source.ts'
import { createChildReader } from './child-reader.ts'
import { buildProcessTree } from './process-tree.ts'
import { ProcessConsoleView, type ProcessConsoleInjected } from './ProcessConsoleView.tsx'
import { processConsoleViewDefinition, streamNodeDefinition } from './stream-definition.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Processes tab copy. */
    'process-console': ProcessConsoleKey
  }
}

export type { ProcessConsoleKey } from './locales.ts'
export type { ProcessConsoleInjected } from './ProcessConsoleView.tsx'
export type { ExternalProcess, ExternalStep, ProcessConsoleViewSnapshot } from './stream-definition.ts'

/** Services the tab registration, its dictionaries, its data source and its event fold require. */
export const inject = ['slots', 'locale', 'sessions', 'uiConversation', 'uiSession', 'remote', 'remote.session']

/** Where the tab sits in the ring: after Chat (0) and Trajectory (10). */
const VIEW_ORDER = 20

/** Resolve only ordinary bindings or catalog-owned descendants of this tab. */
export function resolveProcessBinding(ctx: Context, rootId: SessionId, id: SessionId): ProcessBinding | undefined {
  const list = ctx.sessions.list.getSnapshot()
  const row = buildProcessTree(list, rootId).find(entry => entry.id === id)
  if (row?.parentId !== undefined && row.parentId !== null) {
    const entry = list.subagentsByParent[row.parentId]?.entries.find(child => child.id === id)
    if (entry?.kind === 'diagnostic') return undefined
    // A listed child can also have an ordinary controller binding, but the
    // gateway still requires its durable parent address for every read.
    if (entry?.kind === 'child') return createChildReader({
      address: { kind: 'subagent', parentSessionId: row.parentId, childSessionId: id, mode: entry.mode },
      remote: ctx.remote,
      eventDefinitions: ctx.uiConversation.events,
      viewDefinitions: ctx.uiConversation.views,
      initialRunning: entry.activity === 'running',
    })
  }
  const binding = ctx.sessions.binding(id)
  if (binding !== undefined) {
    const conversation = ctx.uiConversation.binding(binding)
    conversation.activate('process-console')
    return { session: binding.session, events: binding.eventSource, conversation: conversation.snapshot, trajectory: conversation.target('trajectory') }
  }
  return undefined
}

/**
 * Register the dictionaries and the tab.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'process-console: dictionaries')
  // Registration-time text (the tab label) reads through the bound translate
  // as a thunk, so it follows the active locale without re-registration.
  const t = ctx.locale.bind(NS)

  // External delegations: fold `subagent/stream` events from the shared
  // Session window into the `process-console` view target. Both registrations
  // ride the effect so plugin unload removes them.
  ctx.effect(() => ctx.uiConversation.events.register(streamNodeDefinition), 'process-console: stream definition')
  ctx.effect(() => ctx.uiConversation.views.register(processConsoleViewDefinition), 'process-console: view target')

  // One source per conversation, so the selected child survives a tab switch.
  const sources = new Map<SessionId, ProcessSource>()
  ctx.effect(() => () => {
    for (const source of sources.values()) source.dispose()
    sources.clear()
  }, 'process-console: sources')

  // `conversation.view` is declared by ui-conversation; the inject waits on
  // that declaration's lifetime and re-registers after a redeclaration.
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'process-console',
    order: VIEW_ORDER,
    locale: NS,
    label: () => t('view.processes'),
    inject: (sessionId: SessionId): ProcessConsoleInjected => {
      let source = sources.get(sessionId)
      if (source === undefined) {
        source = createProcessSource(id => resolveProcessBinding(ctx, sessionId, id), ctx.uiSession.pendingInteractions)
        source.select(sessionId)
        sources.set(sessionId, source)
      }
      const owned = source
      return {
        hooks: { process: owned },
        select: (id) => { owned.select(id) },
        loadOlder: () => owned.loadOlder(),
      }
    },
  }, ProcessConsoleView))
}
