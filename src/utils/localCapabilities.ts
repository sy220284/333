/**
 * User-controlled local capabilities. Persist through the existing local
 * settings store; none of these flags require vendor feature experiments.
 */
import {
  getFeatureValue_CACHED_MAY_BE_STALE,
  setGrowthBookConfigOverride,
} from '../services/analytics/growthbook.js'

export const LOCAL_CAPABILITY_INFO = {
  'auto-memory': {
    label: '自动整理本地记忆',
    detail: '在对话结束后按需调用一次独立模型代理整理记忆，会增加 Token 消耗',
  },
  'scheduled-tasks': {
    label: '定时任务',
    detail: '开放本地定时任务工具，创建任务时仍需单独确认',
  },
  'agent-teams': {
    label: '多智能体协作',
    detail: '团队与成员协作默认开放；创建成员仍按任务授权执行',
  },
} as const

export type LocalCapability = keyof typeof LOCAL_CAPABILITY_INFO
const keyFor = (name: LocalCapability): string => `local_capability_${name}`

export function isLocalCapability(name: string): name is LocalCapability {
  return Object.hasOwn(LOCAL_CAPABILITY_INFO, name)
}

export function isLocalCapabilityEnabled(name: LocalCapability): boolean {
  return getFeatureValue_CACHED_MAY_BE_STALE<boolean>(keyFor(name), name === 'agent-teams') === true
}

export function setLocalCapabilityEnabled(name: LocalCapability, enabled: boolean): void {
  setGrowthBookConfigOverride(keyFor(name), enabled)
}
