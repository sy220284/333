import { createSessionRuntime317 } from '../../entrypoints/sdk/sessionRuntime317.js'
import type { SDKMessage, SDKUserMessage } from '../../entrypoints/sdk/coreTypes.js'
import type { InternalOptions, SDKSessionOptions } from '../../entrypoints/sdk/runtimeTypes.js'
import { createStore } from '../../state/store.js'
import { createConversationMessageStore } from './messageStore.js'
import { createSdkPermissionBroker } from './permissionBroker.js'

export type HeadlessSessionPhase = 'idle' | 'running' | 'requires_action' | 'completed' | 'cancelled' | 'failed' | 'closed'
export type HeadlessSessionSnapshot = Readonly<{ phase: HeadlessSessionPhase; error?: string }>

/** Persistent SDK session with renderer-independent state and permission control.
 * A desktop process can subscribe to messages/status and respond to pending
 * permissions without importing REPL, React or Ink. */
export function createHeadlessConversationSession(
  options: SDKSessionOptions | InternalOptions,
  resume?: string,
  launch: typeof createSessionRuntime317 = createSessionRuntime317,
) {
  const permissions = createSdkPermissionBroker()
  const runtime = launch({ ...options, canUseTool: options.canUseTool ?? permissions.canUseTool }, resume)
  const messages = createConversationMessageStore<SDKMessage>()
  const state = createStore<HeadlessSessionSnapshot>({ phase: 'idle' })
  let busy = false
  let closed = false
  const setPhase = (phase: HeadlessSessionPhase, error?: string) => {
    if (closed && phase !== 'closed') return
    state.setState(() => ({ phase, ...(error === undefined ? {} : { error }) }))
  }
  const unsubscribe = permissions.subscribe(() => {
    const phase = state.getState().phase
    if (phase !== 'running' && phase !== 'requires_action') return
    const next = permissions.getPending().length ? 'requires_action' : 'running'
    if (phase !== next) setPhase(next)
  })

  const send = async (message: string | SDKUserMessage): Promise<void> => {
    if (closed) throw new Error('Session is closed')
    if (busy) throw new Error('Consume the current session turn before sending another message')
    busy = true
    setPhase('running')
    try {
      await runtime.send(message)
    } catch (error) {
      busy = false
      setPhase('failed', error instanceof Error ? error.message : String(error))
      throw error
    }
  }
  const stream = async function* (): AsyncGenerator<SDKMessage, void, unknown> {
    if (!busy || closed) throw new Error('No active session turn')
    let completed = false
    let failed = false
    try {
      for await (const event of runtime.stream()) {
        messages.setMessages(previous => [...previous, event])
        if (event.type === 'result') completed = true
        yield event
      }
      if (!completed) throw new Error('SDK session stream ended without a result')
      setPhase('completed')
    } catch (error) {
      failed = true
      setPhase('failed', error instanceof Error ? error.message : String(error))
      throw error
    } finally {
      busy = false
      if (!completed && !failed) setPhase('cancelled')
    }
  }
  const interrupt = async (): Promise<void> => {
    if (closed) throw new Error('Session is closed')
    if (busy) await runtime.control({ subtype: 'interrupt' })
  }
  const close = (): void => {
    if (closed) return
    closed = true
    unsubscribe()
    permissions.close()
    runtime.close()
    setPhase('closed')
  }
  const closeAndWait = async (): Promise<void> => {
    close()
    await runtime.closeAndWait()
  }
  return {
    sessionId: runtime.sessionId,
    initialization: runtime.initialization,
    permissions,
    messages,
    state,
    send,
    stream,
    interrupt,
    control: runtime.control,
    close,
    closeAndWait,
  }
}
