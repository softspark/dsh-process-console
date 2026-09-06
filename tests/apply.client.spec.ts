// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { apply, inject } from '../src/client/index.tsx'
import type { ProcessConsoleInjected } from '../src/client/index.tsx'

// Public client entries are DSH-loader registrations rather than Node ESM.
// Ordinary-binding tests never instantiate a separate journal reader.
vi.mock('@deepseek-ai/dsh-api-session-controller/client', () => ({
  SessionEventStream: vi.fn(), MutableSessionEventSource: vi.fn(),
}))
vi.mock('@deepseek-ai/dsh-client-ui-conversation/client', () => ({ ConversationNodeAssembler: vi.fn() }))

const id = (value: string): SessionId => value as SessionId

interface Registration {
  options: Record<string, unknown>
  component: unknown
}

/** A stand-in for the plugin context: only the seams `apply` touches. */
function fakeContext() {
  const registrations: Registration[] = []
  const effects: Array<() => void> = []
  const disposers: Array<() => void> = []
  const dictionaries: unknown[] = []
  const bindings = new Map<SessionId, { session: unknown }>()
  const definitions: Array<{ kind?: string; target: string }> = []
  const ctx = {
    uiConversation: {
      events: {
      register: vi.fn((definition: { kind: string; target?: string }) => {
        definitions.push({ kind: definition.kind, target: definition.target ?? '' })
        return () => {}
      }),
    },
      views: {
      register: vi.fn((definition: { target: string }) => {
        definitions.push({ target: definition.target })
        return () => {}
      }),
    },
      binding: () => ({
        activate: vi.fn(),
        snapshot: { getSnapshot: () => ({ views: { get: () => undefined }, activeTargets: new Set() }), subscribe: () => () => {} },
        target: () => ({ getSnapshot: () => ({ eventNodes: [], partial: null, runningCalls: [] }), subscribe: () => () => {} }),
      }),
    },
    uiSession: { pendingInteractions: { getSnapshot: () => new Map(), subscribe: () => () => {} } },
    sessions: { list: { getSnapshot: () => ({ ids: [], byId: {}, subagentsByParent: {} }) }, binding: (sessionId: SessionId) => {
      const binding = bindings.get(sessionId)
      return binding === undefined ? undefined : { ...binding, eventSource: { getSnapshot: () => ({ revision: 0 }), subscribe: () => () => {} } }
    } },
    effect: (run: () => unknown, _label: string) => {
      effects.push(run as () => void)
      const dispose = run()
      if (typeof dispose === 'function') disposers.push(dispose as () => void)
    },
    locale: {
      register: vi.fn((ns: string, dicts: unknown) => { dictionaries.push([ns, dicts]); return () => {} }),
      bind: vi.fn(() => (key: string) => `t:${key}`),
    },
    get: vi.fn((name: string) => (name === 'sessions'
      ? { binding: (sessionId: SessionId) => bindings.get(sessionId) }
      : undefined)),
    slots: {
      inject: vi.fn((_name: string, register: () => unknown) => register()),
      register: vi.fn((options: Record<string, unknown>, component: unknown) => {
        registrations.push({ options, component })
        return () => {}
      }),
    },
  }
  return { ctx: ctx as unknown as Context, registrations, disposers, dictionaries, bindings, definitions }
}

describe('apply', () => {
  it('declares its services, registers the stream fold and one tab in the conversation view ring', () => {
    expect(inject).toEqual(['slots', 'locale', 'sessions', 'uiConversation', 'uiSession', 'remote', 'remote.session'])
    const { ctx, registrations, dictionaries, definitions } = fakeContext()

    apply(ctx)

    expect(definitions).toEqual([
      { kind: 'process-console-stream', target: 'process-console' },
      { target: 'process-console' },
    ])
    expect(dictionaries).toEqual([['process-console', expect.objectContaining({ en: expect.anything(), zh: expect.anything() })]])
    expect(registrations).toHaveLength(1)
    const [entry] = registrations
    expect(entry?.options).toMatchObject({ name: 'conversation.view', id: 'process-console', order: 20, locale: 'process-console' })
    expect((entry?.options.label as () => string)()).toBe('t:view.processes')
    expect(typeof entry?.component).toBe('function')
  })

  it('binds one source per conversation, selects the root and survives a remount', () => {
    const { ctx, registrations, bindings, disposers } = fakeContext()
    const face = {
      getSnapshot: () => ({ openState: 'open', nodes: [] }),
      subscribe: () => () => {},
      loadOlder: vi.fn(async () => {}),
    }
    bindings.set(id('root'), { session: face })
    apply(ctx)
    const factory = registrations[0]?.options.inject as (sessionId: SessionId) => ProcessConsoleInjected

    const first = factory(id('root'))
    expect(first.hooks.process.getSnapshot()).toMatchObject({ selected: 'root', status: 'live' })

    // A child the runtime does not know is reported, never rendered blank.
    first.select(id('ghost'))
    expect(first.hooks.process.getSnapshot().status).toBe('unavailable')

    bindings.set(id('child'), { session: face })
    first.select(id('child'))
    // A tab switch preserves the selected child and the existing source.
    const second = factory(id('root'))
    expect(second.hooks.process).toBe(first.hooks.process)
    expect(second.hooks.process.getSnapshot()).toMatchObject({ selected: 'child', status: 'live' })

    // Plugin unload disposes every source.
    for (const dispose of disposers) dispose()
    expect(first.hooks.process.getSnapshot()).toEqual({ selected: null, status: 'idle', conversation: null })
  })
})
