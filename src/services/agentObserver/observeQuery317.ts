import type { QueryParams } from '../../query.js'
import type { Terminal } from '../../query/transitions.js'
import type { Message } from '../../types/message.js'
import { getSessionId, onSessionSwitch } from '../../bootstrap/state.js'
import { isEnvTruthy } from '../../utils/envUtils.js'
import { logError } from '../../utils/log.js'
import type { CacheSafeParams } from '../../utils/forkedAgent.js'
import { createObserverRuntime317, type ObserverRuntime317 } from './observerRuntime317.js'
import type { ObserverActivity317 } from './observer317.js'

type StreamValue317 = { type: string }
type Entry317 = {
  agentType: string
  params: QueryParams
  messages: Message[]
  runtime: Promise<ObserverRuntime317 | null>
}

const observers = new Map<string, Entry317>()
onSessionSwitch(() => observers.clear())

function captureActivity(value: StreamValue317, activity: ObserverActivity317[], history: Message[]): void {
  if (value.type === 'assistant' && 'message' in value && value.message &&
      typeof value.message === 'object' && 'content' in value.message &&
      Array.isArray(value.message.content)) {
    const assistant = value as unknown as Message
    if (assistant.type !== 'assistant') return
    for (const block of assistant.message.content) {
      if (block.type === 'text' && block.text.trim()) {
        activity.push({ type: 'assistant_text', text: block.text })
      } else if (block.type === 'tool_use') {
        activity.push({ type: 'tool_call', name: block.name, input: JSON.stringify(block.input ?? {}) })
      }
    }
    history.push(assistant)
  } else if (value.type === 'user' && 'message' in value) {
    const user = value as unknown as Message
    if (user.type === 'user') history.push(user)
  }
}

export async function* observeQuery317<T extends StreamValue317>(
  params: QueryParams,
  stream: AsyncGenerator<T, Terminal, unknown>,
): AsyncGenerator<T, Terminal, unknown> {
  const permissionEnabled = isEnvTruthy(process.env.CLAUDE_CODE_EXPERIMENTAL_OBSERVER_AGENTS)
  const appState = params.toolUseContext.getAppState()
  const agentType = appState.agent
  const agents = params.toolUseContext.options.agentDefinitions.activeAgents
  const observed = agents.find(agent => agent.agentType === agentType)
  if (!permissionEnabled || !observed?.observer) {
    return yield* stream
  }

  const sessionId = params.toolUseContext.sessionId ?? getSessionId()
  const key = sessionId
  let entry = observers.get(key)
  if (!entry || entry.agentType !== observed.agentType) {
    const next: Entry317 = {
      agentType: observed.agentType,
      params,
      messages: [...params.messages],
      runtime: Promise.resolve(null),
    }
    next.runtime = createObserverRuntime317({
      sessionId,
      agent: observed,
      agents,
      getCacheParams: (): CacheSafeParams => ({
        systemPrompt: next.params.systemPrompt,
        userContext: next.params.userContext,
        systemContext: next.params.systemContext,
        toolUseContext: next.params.toolUseContext,
        forkContextMessages: next.messages,
      }),
      getPermissionContext: () => next.params.toolUseContext.getAppState().toolPermissionContext,
      canUseTool: params.canUseTool,
    })
    observers.set(key, next)
    entry = next
  }
  entry.params = params
  entry.messages = [...params.messages]

  const activity: ObserverActivity317[] = []
  let finished = false
  try {
    for (;;) {
      const step = await stream.next()
      if (step.done) {
        finished = true
        if (step.value.reason === 'completed' && activity.length > 0 &&
            !params.toolUseContext.abortController.signal.aborted) {
          activity.push({ type: 'turn_ended', reason: 'completed' })
          void entry.runtime
            .then(runtime => runtime?.afterTurn(activity))
            .catch(logError)
        }
        return step.value
      }
      captureActivity(step.value, activity, entry.messages)
      yield step.value
    }
  } finally {
    if (!finished) await stream.return({ reason: 'aborted_streaming' })
  }
}
