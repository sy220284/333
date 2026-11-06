import { useEffect } from 'react'
import { useNotifications } from 'src/context/notifications.js'
import { useAppState, useSetAppState } from 'src/state/AppState.js'
import {
  type CooldownReason,
  isFastModeEnabled,
  onCooldownExpired,
  onCooldownTriggered,
  onFastModeOverageRejection,
} from 'src/utils/fastMode.js'
import { formatDuration } from 'src/utils/format.js'
import { getIsRemoteMode } from '../../bootstrap/state.js'

const COOLDOWN_STARTED_KEY = 'fast-mode-cooldown-started'
const COOLDOWN_EXPIRED_KEY = 'fast-mode-cooldown-expired'
const OVERAGE_REJECTED_KEY = 'fast-mode-overage-rejected'

export function useFastModeNotification(): void {
  const { addNotification } = useNotifications()
  const isFastMode = useAppState(s => s.fastMode)
  const setAppState = useSetAppState()

  useEffect(() => {
    if (getIsRemoteMode() || !isFastModeEnabled()) return
    return onFastModeOverageRejection(message => {
      setAppState(prev => ({ ...prev, fastMode: false }))
      addNotification({
        key: OVERAGE_REJECTED_KEY,
        color: 'warning',
        priority: 'immediate',
        text: message,
      })
    })
  }, [addNotification, setAppState])

  useEffect(() => {
    if (getIsRemoteMode() || !isFastMode) return
    const stopTriggered = onCooldownTriggered((resetAt, reason) => {
      const resetIn = formatDuration(resetAt - Date.now(), { hideTrailingZeros: true })
      addNotification({
        key: COOLDOWN_STARTED_KEY,
        invalidates: [COOLDOWN_EXPIRED_KEY],
        text: cooldownMessage(reason, resetIn),
        color: 'warning',
        priority: 'immediate',
      })
    })
    const stopExpired = onCooldownExpired(() => {
      addNotification({
        key: COOLDOWN_EXPIRED_KEY,
        invalidates: [COOLDOWN_STARTED_KEY],
        color: 'fastMode',
        text: '快速模式限制已重置',
        priority: 'immediate',
      })
    })
    return () => {
      stopTriggered()
      stopExpired()
    }
  }, [addNotification, isFastMode])
}

function cooldownMessage(reason: CooldownReason, resetIn: string): string {
  switch (reason) {
    case 'overloaded': return `快速模式当前繁忙 · ${resetIn} 后重试`
    case 'rate_limit': return `快速模式达到限额 · ${resetIn} 后重置`
  }
}
