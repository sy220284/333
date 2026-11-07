import type { LocalCommandCall } from '../../types/command.js'
import {
  getLocalPrivacyPreference,
  setLocalPrivacyPreference,
  type LocalPrivacyPreference,
} from '../../services/localRuntime/privacyChoices.js'
import { getPrivacyLevel, isTelemetryDisabled } from '../../utils/privacyLevel.js'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { join } from 'node:path'

const labels: Record<LocalPrivacyPreference, string> = {
  default: '本机诊断开启，常规模型请求照常运行',
  'no-telemetry': '关闭遥测和本地诊断事件记录',
  'essential-traffic': '关闭遥测与非必要网络请求，保留用户主动发起的模型调用',
}

export const call: LocalCommandCall = async args => {
  const command = args.trim().toLowerCase()
  if (command && command !== 'status' && command !== 'show') {
    if (!Object.hasOwn(labels, command)) {
      return { type: 'text', value: '用法：/privacy-settings [status|default|no-telemetry|essential-traffic]' }
    }
    setLocalPrivacyPreference(command as LocalPrivacyPreference)
  }
  const stored = getLocalPrivacyPreference()
  const effective = getPrivacyLevel()
  return {
    type: 'text',
    value: [
      `本机隐私配置：${stored}（${labels[stored]}）`,
      `当前生效级别：${effective}；本地遥测：${isTelemetryDisabled() ? '关闭' : '开启'}`,
      `配置文件：${join(getClaudeConfigHomeDir(), 'privacy.json')}`,
      '环境变量可进一步收紧隐私级别；上述设置与服务商账号隐私政策分别管理。',
    ].join('\n'),
  }
}
