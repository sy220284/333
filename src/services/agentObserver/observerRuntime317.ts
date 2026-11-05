import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { CanUseToolFn } from '../../hooks/useCanUseTool.js'
import type { SessionId } from '../../types/ids.js'
import type { ToolPermissionContext } from '../../Tool.js'
import type { AgentDefinition } from '../../tools/AgentTool/loadAgentsDir.js'
import { isBuiltInAgent } from '../../tools/AgentTool/loadAgentsDir.js'
import { AGENT_TOOL_NAME } from '../../tools/AgentTool/constants.js'
import { getClaudeConfigHomeDir, isEnvTruthy } from '../../utils/envUtils.js'
import { filterDeniedAgents } from '../../utils/permissions/permissions.js'
import type { CacheSafeParams } from '../../utils/forkedAgent.js'
import { enqueuePendingNotification } from '../../utils/messageQueueManager.js'
import { formatBackgroundTaskNotification } from '../../utils/systemNotificationPrompts.js'
import {
  ObserverSession317,
  selectObserver317,
  type ObserverActivity317,
  type ObserverPairing317,
} from './observer317.js'
import { createObserverForkHost317 } from './observerForkHost317.js'

export type ObserverRuntime317 = {
  afterTurn(activity: ObserverActivity317[], trigger?: string): Promise<void>
  stop(): Promise<void>
}

function fileFor(sessionId: string): string {
  if (!/^[0-9a-f-]{24,40}$/i.test(sessionId)) {
    throw new Error('Observer session identifier is invalid')
  }
  return join(getClaudeConfigHomeDir(), 'observer-sessions', sessionId + '.json')
}

export async function createObserverRuntime317(args: {
  sessionId: SessionId
  notificationSessionId?: SessionId
  agent: AgentDefinition
  agents: AgentDefinition[]
  getCacheParams: () => CacheSafeParams
  getPermissionContext: () => ToolPermissionContext
  canUseTool: CanUseToolFn
}): Promise<ObserverRuntime317 | null> {
  if (!isEnvTruthy(process.env.CLAUDE_CODE_EXPERIMENTAL_OBSERVER_AGENTS)) {
    return null
  }
  const observer = selectObserver317(args.agent, args.agents, true)
  if (!observer) return null

  const observerType = observer.agentType
  const path = fileFor(args.sessionId)
  const host = createObserverForkHost317({
    getCacheParams: args.getCacheParams,
    canUseTool: args.canUseTool,
    getObserverInstructions: () => isBuiltInAgent(observer)
      ? observer.getSystemPrompt({
          toolUseContext: args.getCacheParams().toolUseContext,
        })
      : observer.getSystemPrompt(),
    authorize: async pairing => {
      if (!isEnvTruthy(process.env.CLAUDE_CODE_EXPERIMENTAL_OBSERVER_AGENTS)) {
        return false
      }
      return pairing.observerType === observerType &&
        filterDeniedAgents([observer], args.getPermissionContext(), AGENT_TOOL_NAME).length === 1
    },
    persist: async pairing => {
      const folder = join(getClaudeConfigHomeDir(), 'observer-sessions')
      await mkdir(folder, { recursive: true, mode: 0o700 })
      const temp = path + '.' + randomUUID() + '.tmp'
      await writeFile(temp, JSON.stringify(pairing), { encoding: 'utf8', mode: 0o600, flag: 'wx' })
      await rename(temp, path)
    },
    report: async (_, text) => {
      enqueuePendingNotification({
        mode: 'task-notification',
        priority: 'later',
        sessionId: args.notificationSessionId ?? args.sessionId,
        isMeta: true,
        origin: { kind: 'task-notification' },
        value: formatBackgroundTaskNotification(
          '[ObserverReport — independent background review]\n' + text,
        ),
      })
    },
  })
  const session = new ObserverSession317(host)
  let saved: ObserverPairing317 | undefined
  try {
    const raw = await readFile(path, 'utf8')
    saved = JSON.parse(raw) as ObserverPairing317
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
      throw error
    }
  }
  if (saved && saved.observerType === observerType &&
      saved.observedId === args.sessionId && saved.state === 'armed') {
    await session.resume(saved)
  } else if (!saved || saved.state !== 'stopped') {
    await session.arm({
      observedId: args.sessionId,
      observedName: args.agent.agentType,
      observerId: randomUUID(),
      observerType,
      fanoutDepth: 0,
      observerMessage: args.agent.observerMessage,
    })
  }

  return {
    afterTurn: async (activity, trigger) =>
      session.enqueue(args.sessionId, activity, trigger),
    stop: async () => session.stop(args.sessionId),
  }
}
