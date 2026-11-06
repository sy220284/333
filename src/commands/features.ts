import type { Command, LocalCommandCall } from '../types/command.js'
import {
  LOCAL_CAPABILITY_INFO,
  isLocalCapability,
  isLocalCapabilityEnabled,
  setLocalCapabilityEnabled,
} from '../utils/localCapabilities.js'

const call: LocalCommandCall = async args => {
  const [action = 'status', name, ...extra] = args.trim().split(/\s+/).filter(Boolean)
  const help = '用法：/features 查看状态；/features on auto-memory|scheduled-tasks|agent-teams；/features off <功能名>'
  if (action === 'status' || action === 'list') {
    if (name || extra.length) return { type: 'text', value: help }
    const rows = Object.entries(LOCAL_CAPABILITY_INFO).map(([id, info]) =>
      `${isLocalCapabilityEnabled(id as keyof typeof LOCAL_CAPABILITY_INFO) ? '已开启' : '已关闭'} · ${info.label} (${id})：${info.detail}`,
    )
    return { type: 'text', value: ['本地高级功能（团队协作默认开启，其他高级功能按需开启）', ...rows, '', help].join('\n') }
  }
  if (!['on', 'enable', 'off', 'disable'].includes(action) || !name ||
      extra.length > 0 || !isLocalCapability(name)) {
    return { type: 'text', value: help }
  }
  const enabled = action === 'on' || action === 'enable'
  setLocalCapabilityEnabled(name, enabled)
  const state = isLocalCapabilityEnabled(name)
  return {
    type: 'text',
    value: `${LOCAL_CAPABILITY_INFO[name].label}已${state ? '开启' : '关闭'}（配置保存在本地）${name === 'scheduled-tasks' && state ? '；每次创建任务还需用户批准' : ''}`,
  }
}

const localFeatures = {
  type: 'local',
  name: 'features',
  description: '查看与开启本地高级功能：自动记忆、定时任务、多智能体',
  argumentHint: '[status|on|off] [auto-memory|scheduled-tasks|agent-teams]',
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
} satisfies Command

export default localFeatures
