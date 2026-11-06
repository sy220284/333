import { useEffect, useRef, useSyncExternalStore } from 'react'
import { TICK_TAG } from '../constants/xml.js'
import { getSelectedMissionId, getMission } from '../utils/agentMissions.js'
import { isSuperAgentMode } from '../utils/agentMode.js'
import { logForDebugging } from '../utils/debug.js'
import {
  isProactiveActive, isProactivePaused, pauseProactive, subscribeToProactiveChanges,
} from './index.js'

type Options = {
  isLoading: boolean
  queuedCommandsLength: number
  hasActiveLocalJsxUI: boolean
  isInPlanMode: boolean
  onSubmitTick: (prompt: string) => void | Promise<void>
  onQueueTick: (prompt: string) => void
}
const getSnapshot = () => `${isProactiveActive()}:${isProactivePaused()}`
const getServerSnapshot = () => 'false:false'
const IDLE_WAKE_MS = 5000

/** An explicitly activated local session stays awake while it has authorized work.
 * No timer exists when the user has not opted in or when a mission is paused.
 */
export function useProactive({
  isLoading, queuedCommandsLength, hasActiveLocalJsxUI, isInPlanMode, onSubmitTick,
}: Options): void {
  const current = useSyncExternalStore(
    subscribeToProactiveChanges, getSnapshot, getServerSnapshot,
  )
  const submitRef = useRef(onSubmitTick)
  submitRef.current = onSubmitTick
  useEffect(() => {
    if (current !== 'true:false' || isLoading || queuedCommandsLength > 0 ||
        hasActiveLocalJsxUI || isInPlanMode) return
    let cancelled = false
    const timer = setTimeout(() => {
      void (async () => {
        if (cancelled || !isProactiveActive() || isProactivePaused()) return
        if (isSuperAgentMode()) {
          const selected = getSelectedMissionId()
          if (selected) {
            const mission = await getMission(selected)
            if (mission.status !== 'active') {
              pauseProactive()
              return
            }
          }
        }
        if (cancelled || !isProactiveActive() || isProactivePaused()) return
        await submitRef.current(`<${TICK_TAG}>${new Date().toLocaleTimeString()}</${TICK_TAG}>`)
      })().catch(error => {
        logForDebugging(`持续任务唤醒失败：${String(error)}`)
        pauseProactive()
      })
    }, IDLE_WAKE_MS)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [current, isLoading, queuedCommandsLength, hasActiveLocalJsxUI, isInPlanMode])
}
