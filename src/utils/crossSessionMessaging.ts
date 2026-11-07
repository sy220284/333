import { isEnvTruthy } from './envUtils.js'

// Local peer messaging works independently of cloud account entitlements.
export function isCrossSessionMessagingEnabled(): boolean {
  const override = process.env.CLAUDE_CODE_HARBOR_KITE
  return override === undefined || isEnvTruthy(override)
}
