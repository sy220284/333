/**
 * 333 local feature switches.
 *
 * Historical GrowthBook API names remain as compatibility entrypoints for
 * callers and saved settings. No remote experimentation, user targeting,
 * exposure collection, polling, or vendor network connection is performed.
 */
import { isEqual } from 'lodash-es'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { logForDebugging } from '../../utils/debug.js'
import { logError } from '../../utils/log.js'
import type { GitHubActionsMetadata } from '../../utils/user.js'

export type GrowthBookUserAttributes = {
  id: string
  sessionId: string
  deviceID: string
  platform: 'win32' | 'darwin' | 'linux'
  apiBaseUrlHost?: string
  organizationUUID?: string
  accountUUID?: string
  userType?: string
  subscriptionType?: string
  rateLimitTier?: string
  firstTokenTime?: number
  email?: string
  appVersion?: string
  github?: GitHubActionsMetadata
}

type RefreshListener = () => void | Promise<void>
const listeners = new Set<RefreshListener>()

function notifyListeners(): void {
  for (const listener of listeners) {
    try {
      const pending = listener()
      if (pending) void pending.catch(logError)
    } catch (error) {
      logError(error)
    }
  }
}

export function onGrowthBookRefresh(listener: RefreshListener): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

let internalOverrides: Record<string, unknown> | null = null
let overridesLoaded = false

function getEnvOverrides(): Record<string, unknown> | null {
  if (overridesLoaded) return internalOverrides
  overridesLoaded = true
  // Retain explicitly opted-in internal test fixtures for migrated harnesses.
  if (process.env.USER_TYPE !== 'ant') return null
  const raw = process.env.CLAUDE_INTERNAL_FC_OVERRIDES
  if (!raw) return null
  try {
    const result: unknown = JSON.parse(raw)
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      throw new Error('Feature overrides must be an object')
    }
    internalOverrides = result as Record<string, unknown>
  } catch (error) {
    logError(new Error('Invalid CLAUDE_INTERNAL_FC_OVERRIDES', { cause: error }))
  }
  return internalOverrides
}

export function hasGrowthBookEnvOverride(feature: string): boolean {
  return Object.hasOwn(getEnvOverrides() ?? {}, feature)
}

function getConfigOverrides(): Record<string, unknown> | undefined {
  try {
    return getGlobalConfig().growthBookOverrides
  } catch {
    // The config subsystem intentionally blocks reads during early bootstrap.
    logForDebugging('333 local feature switches not yet available during bootstrap')
    return undefined
  }
}

function readLocalFeature<T>(name: string, defaultValue: T): T {
  const environment = getEnvOverrides()
  if (environment && Object.hasOwn(environment, name)) return environment[name] as T
  const configured = getConfigOverrides()
  if (configured && Object.hasOwn(configured, name)) return configured[name] as T
  return defaultValue
}

export function getAllGrowthBookFeatures(): Record<string, unknown> {
  return { ...(getConfigOverrides() ?? {}), ...(getEnvOverrides() ?? {}) }
}

export function getGrowthBookConfigOverrides(): Record<string, unknown> {
  return { ...(getConfigOverrides() ?? {}) }
}

export function setGrowthBookConfigOverride(feature: string, value: unknown): void {
  saveGlobalConfig(config => {
    const current = config.growthBookOverrides ?? {}
    if (value === undefined) {
      if (!Object.hasOwn(current, feature)) return config
      const { [feature]: _discarded, ...rest } = current
      if (Object.keys(rest).length === 0) {
        const { growthBookOverrides: _removed, ...other } = config
        return other
      }
      return { ...config, growthBookOverrides: rest }
    }
    if (isEqual(current[feature], value)) return config
    return { ...config, growthBookOverrides: { ...current, [feature]: value } }
  })
  notifyListeners()
}

export function clearGrowthBookConfigOverrides(): void {
  saveGlobalConfig(config => {
    if (!config.growthBookOverrides || Object.keys(config.growthBookOverrides).length === 0) return config
    const { growthBookOverrides: _removed, ...other } = config
    return other
  })
  notifyListeners()
}

export function getApiBaseUrlHost(): string | undefined {
  const value = process.env.ANTHROPIC_BASE_URL
  if (!value) return undefined
  try {
    const hostname = new URL(value).host
    return hostname === 'api.anthropic.com' ? undefined : hostname
  } catch (error) {
    logError(new Error('Invalid ANTHROPIC_BASE_URL', { cause: error }))
    return undefined
  }
}

export async function initializeGrowthBook(): Promise<null> { return null }
export async function getFeatureValue_DEPRECATED<T>(name: string, fallback: T): Promise<T> {
  return readLocalFeature(name, fallback)
}
export function getFeatureValue_CACHED_MAY_BE_STALE<T>(name: string, fallback: T): T {
  return readLocalFeature(name, fallback)
}
export function getFeatureValue_CACHED_WITH_REFRESH<T>(name: string, fallback: T, _refreshIntervalMs: number): T {
  return readLocalFeature(name, fallback)
}
export function checkStatsigFeatureGate_CACHED_MAY_BE_STALE(name: string): boolean {
  return Boolean(readLocalFeature(name, false))
}
export async function checkSecurityRestrictionGate(name: string): Promise<boolean> {
  return Boolean(readLocalFeature(name, false))
}
export async function checkGate_CACHED_OR_BLOCKING(name: string): Promise<boolean> {
  return Boolean(readLocalFeature(name, false))
}
export function refreshGrowthBookAfterAuthChange(): void { notifyListeners() }
export function resetGrowthBook(_options: { preservePendingExposures?: boolean; preserveLoggedExposures?: boolean } = {}): void {
  notifyListeners()
}
export async function refreshGrowthBookFeatures(): Promise<void> { notifyListeners() }
export function setupPeriodicGrowthBookRefresh(): void {}
export function stopPeriodicGrowthBookRefresh(): void {}
export async function getDynamicConfig_BLOCKS_ON_INIT<T>(name: string, fallback: T): Promise<T> {
  return readLocalFeature(name, fallback)
}
export function getDynamicConfig_CACHED_MAY_BE_STALE<T>(name: string, fallback: T): T {
  return readLocalFeature(name, fallback)
}
