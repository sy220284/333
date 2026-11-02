import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'
import { isEnvTruthy } from './envUtils.js'

// The 2.1.310 harbor-kite switch is independent of the teammate swarms gate.
export function isCrossSessionMessagingEnabled(): boolean {
  const override = process.env.CLAUDE_CODE_HARBOR_KITE
  if (override !== undefined) return isEnvTruthy(override)
  if (process.platform === 'win32' && !getFeatureValue_CACHED_MAY_BE_STALE('tengu_harbor_kite_win', true)) return false
  return getFeatureValue_CACHED_MAY_BE_STALE('tengu_harbor_kite', true)
}
