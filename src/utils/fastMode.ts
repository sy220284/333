import {
  getIsNonInteractiveSession,
  getKairosActive,
  preferThirdPartyAuthentication,
} from '../bootstrap/state.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../services/analytics/index.js'
import { logForDebugging } from './debug.js'
import { isEnvTruthy } from './envUtils.js'
import {
  getDefaultMainLoopModelSetting,
  isOpus1mMergeEnabled,
  type ModelSetting,
  parseUserSpecifiedModel,
} from './model/model.js'
import { getAPIProvider } from './model/providers.js'
import {
  getInitialSettings,
  getSettingsForSource,
  updateSettingsForSource,
} from './settings/settings.js'
import { createSignal } from './signal.js'

export function isFastModeEnabled(): boolean {
  return !isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_FAST_MODE)
}

export function isFastModeAvailable(): boolean {
  if (!isFastModeEnabled()) {
    return false
  }
  return getFastModeUnavailableReason() === null
}

let requestRejected = false

export function getFastModeUnavailableReason(): string | null {
  if (!isFastModeEnabled()) {
    return 'Fast mode is not available'
  }

  // Not available in the SDK unless explicitly opted in via --settings.
  // Assistant daemon mode is exempt — it's first-party orchestration, and
  // kairosActive is set before this check runs (main.tsx:~1626 vs ~3249).
  if (
    getIsNonInteractiveSession() &&
    preferThirdPartyAuthentication() &&
    !getKairosActive()
  ) {
    const flagFastMode = getSettingsForSource('flagSettings')?.fastMode
    if (!flagFastMode) {
      const reason = 'Fast mode is not available in the Agent SDK'
      logForDebugging(`Fast mode unavailable: ${reason}`)
      return reason
    }
  }

  // Only available for 1P (not Bedrock/Vertex/Foundry)
  if (getAPIProvider() !== 'firstParty') {
    const reason = 'Fast mode is not available on Bedrock, Vertex, or Foundry'
    logForDebugging(`Fast mode unavailable: ${reason}`)
    return reason
  }

  return requestRejected ? '当前模型接口拒绝快速推理' : null
}

// @[MODEL LAUNCH]: Update supported Fast Mode models.
export const FAST_MODE_MODEL_DISPLAY = 'Opus 4.6'

export function getFastModeModel(): string {
  return 'opus' + (isOpus1mMergeEnabled() ? '[1m]' : '')
}

export function getInitialFastModeSetting(model: ModelSetting): boolean {
  if (!isFastModeEnabled()) {
    return false
  }
  if (!isFastModeAvailable()) {
    return false
  }
  if (!isFastModeSupportedByModel(model)) {
    return false
  }
  const settings = getInitialSettings()
  // If per-session opt-in is required, fast mode starts off each session
  if (settings.fastModePerSessionOptIn) {
    return false
  }
  return settings.fastMode === true
}

export function isFastModeSupportedByModel(
  modelSetting: ModelSetting,
): boolean {
  if (!isFastModeEnabled()) {
    return false
  }
  const model = modelSetting ?? getDefaultMainLoopModelSetting()
  const parsedModel = parseUserSpecifiedModel(model)
  return parsedModel.toLowerCase().includes('opus-4-6')
}

// --- Fast mode runtime state ---
// Separate from user preference (settings.fastMode). This tracks the actual
// operational state: whether we're actively sending fast speed or in cooldown
// after a rate limit.

export type FastModeRuntimeState =
  | { status: 'active' }
  | { status: 'cooldown'; resetAt: number; reason: CooldownReason }

let runtimeState: FastModeRuntimeState = { status: 'active' }
let hasLoggedCooldownExpiry = false

// --- Cooldown event listeners ---
export type CooldownReason = 'rate_limit' | 'overloaded'

const cooldownTriggered =
  createSignal<[resetAt: number, reason: CooldownReason]>()
const cooldownExpired = createSignal()
export const onCooldownTriggered = cooldownTriggered.subscribe
export const onCooldownExpired = cooldownExpired.subscribe

export function getFastModeRuntimeState(): FastModeRuntimeState {
  if (
    runtimeState.status === 'cooldown' &&
    Date.now() >= runtimeState.resetAt
  ) {
    if (isFastModeEnabled() && !hasLoggedCooldownExpiry) {
      logForDebugging('Fast mode cooldown expired, re-enabling fast mode')
      hasLoggedCooldownExpiry = true
      cooldownExpired.emit()
    }
    runtimeState = { status: 'active' }
  }
  return runtimeState
}

export function triggerFastModeCooldown(
  resetTimestamp: number,
  reason: CooldownReason,
): void {
  if (!isFastModeEnabled()) {
    return
  }
  runtimeState = { status: 'cooldown', resetAt: resetTimestamp, reason }
  hasLoggedCooldownExpiry = false
  const cooldownDurationMs = resetTimestamp - Date.now()
  logForDebugging(
    `Fast mode cooldown triggered (${reason}), duration ${Math.round(cooldownDurationMs / 1000)}s`,
  )
  logEvent('tengu_fast_mode_fallback_triggered', {
    cooldown_duration_ms: cooldownDurationMs,
    cooldown_reason:
      reason as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })
  cooldownTriggered.emit(resetTimestamp, reason)
}

export function clearFastModeCooldown(): void {
  runtimeState = { status: 'active' }
}

/**
 * Called when the API rejects a fast mode request (e.g., 400 "Fast mode is
 * not enabled for your organization"). Permanently disables fast mode using
 * the same flow as when the prefetch discovers the org has it disabled.
 */
export function handleFastModeRejectedByAPI(): void {
  requestRejected = true
  updateSettingsForSource('userSettings', { fastMode: undefined })
  overageRejection.emit('当前模型接口拒绝快速推理，已关闭快速模式')
}

// --- Overage rejection listeners ---
// Fired when a 429 indicates fast mode was rejected because extra usage
// (overage billing) is not available. Distinct from org-level disabling.
const overageRejection = createSignal<[message: string]>()
export const onFastModeOverageRejection = overageRejection.subscribe

function getOverageDisabledMessage(reason: string | null): string {
  switch (reason) {
    case 'out_of_credits':
      return 'Fast mode disabled · extra usage credits exhausted'
    case 'org_level_disabled':
    case 'org_service_level_disabled':
      return 'Fast mode disabled · extra usage disabled by your organization'
    case 'org_level_disabled_until':
      return 'Fast mode disabled · extra usage spending cap reached'
    case 'member_level_disabled':
      return 'Fast mode disabled · extra usage disabled for your account'
    case 'seat_tier_level_disabled':
    case 'seat_tier_zero_credit_limit':
    case 'member_zero_credit_limit':
      return 'Fast mode disabled · extra usage not available for your plan'
    case 'overage_not_provisioned':
    case 'no_limits_configured':
      return 'Fast mode requires extra usage billing · /extra-usage to enable'
    default:
      return 'Fast mode disabled · extra usage not available'
  }
}

function isOutOfCreditsReason(reason: string | null): boolean {
  return reason === 'org_level_disabled_until' || reason === 'out_of_credits'
}

/**
 * Called when a 429 indicates fast mode was rejected because extra usage
 * is not available. Permanently disables fast mode (unless the user has
 * ran out of credits) and notifies with a reason-specific message.
 */
export function handleFastModeOverageRejection(reason: string | null): void {
  const message = getOverageDisabledMessage(reason)
  logForDebugging(
    `Fast mode overage rejection: ${reason ?? 'unknown'} — ${message}`,
  )
  logEvent('tengu_fast_mode_overage_rejected', {
    overage_disabled_reason: (reason ??
      'unknown') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })
  // Disable fast mode permanently unless the user has ran out of credits
  if (!isOutOfCreditsReason(reason)) {
    updateSettingsForSource('userSettings', { fastMode: undefined })
    requestRejected = true
  }
  overageRejection.emit(message)
}

export function isFastModeCooldown(): boolean {
  return getFastModeRuntimeState().status === 'cooldown'
}

export function getFastModeState(
  model: ModelSetting,
  fastModeUserEnabled: boolean | undefined,
): 'off' | 'cooldown' | 'on' {
  const enabled =
    isFastModeEnabled() &&
    isFastModeAvailable() &&
    !!fastModeUserEnabled &&
    isFastModeSupportedByModel(model)
  if (enabled && isFastModeCooldown()) {
    return 'cooldown'
  }
  if (enabled) {
    return 'on'
  }
  return 'off'
}

