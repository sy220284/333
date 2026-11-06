import { getLocalPrivacyPreference } from '../services/localRuntime/privacyChoices.js'

/**
 * Privacy level controls how much nonessential network traffic and telemetry
 * Claude Code generates.
 *
 * Levels are ordered by restrictiveness:
 *   default < no-telemetry < essential-traffic
 *
 * - default:            本机诊断可用，非必要网络请求受现有配置约束。
 * - no-telemetry:       不写入本地遥测、诊断事件。
 * - essential-traffic:  ALL nonessential network traffic disabled
 *                       （包含自动更新、产品公告、非必要能力查询等）。
 *
 * The resolved level is the most restrictive signal from:
 *   CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC  →  essential-traffic
 *   DISABLE_TELEMETRY / DO_NOT_TRACK          →  no-telemetry
 *   /privacy-settings                        →  持久化的本地隐私选择
 */

type PrivacyLevel = 'default' | 'no-telemetry' | 'essential-traffic'

function enabled(value: string | undefined): boolean {
  return value !== undefined && !['', '0', 'false', 'off', 'no'].includes(value.trim().toLowerCase())
}

export function getPrivacyLevel(): PrivacyLevel {
  const local = getLocalPrivacyPreference()
  if (enabled(process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC) || local === 'essential-traffic') {
    return 'essential-traffic'
  }
  if (enabled(process.env.DISABLE_TELEMETRY) || enabled(process.env.DO_NOT_TRACK) || local === 'no-telemetry') {
    return 'no-telemetry'
  }
  return 'default'
}

/**
 * True when all nonessential network traffic should be suppressed.
 * Equivalent to the old `process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` check.
 */
export function isEssentialTrafficOnly(): boolean {
  return getPrivacyLevel() === 'essential-traffic'
}

/**
 * True when telemetry/analytics should be suppressed.
 * True at both `no-telemetry` and `essential-traffic` levels.
 */
export function isTelemetryDisabled(): boolean {
  return getPrivacyLevel() !== 'default'
}

/**
 * Returns the env var name responsible for the current essential-traffic restriction,
 * or null if unrestricted. Used for user-facing "unset X to re-enable" messages.
 */
export function getEssentialTrafficOnlyReason(): string | null {
  if (enabled(process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC)) {
    return 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC'
  }
  return getLocalPrivacyPreference() === 'essential-traffic' ? '/privacy-settings' : null
}
