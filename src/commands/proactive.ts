import type { Command, LocalCommandCall } from '../types/command.js'
import {
  activateProactive, deactivateProactive, isProactiveActive, isProactivePaused,
  pauseProactive, resumeProactive,
} from '../proactive/index.js'
import { getSelectedMissionId, requireActiveSelectedMission } from '../utils/agentMissions.js'
import { isSuperAgentMode } from '../utils/agentMode.js'

const call: LocalCommandCall = async args => {
  const action = args.trim().toLowerCase() || 'status'
  if (action === 'status')
    return { type: 'text', value: isProactiveActive()
      ? (isProactivePaused() ? '本会话自主推进已暂停。' : '本会话自主推进运行中。')
      : '本会话自主推进未启动。使用 /agents mission run 或 /proactive on 显式启动。' }
  if (action === 'off' || action === 'stop') {
    deactivateProactive()
    return { type: 'text', value: '已停止本会话自主推进。' }
  }
  if (action === 'pause') {
    pauseProactive()
    return { type: 'text', value: '已暂停本会话自主推进。' }
  }
  if (action === 'on' || action === 'resume') {
    if (isSuperAgentMode()) {
      const selected = getSelectedMissionId()
      if (!selected) throw new Error('超级智能体模式需要先执行 /agents mission new 或 use 选择目标')
      await requireActiveSelectedMission()
    }
    if (isProactiveActive()) resumeProactive()
    else activateProactive('command')
    return { type: 'text', value: '已在本机会话开启自主推进。仅对当前授权目标工作；使用 /proactive off 停止。' }
  }
  return { type: 'text', value: '用法：/proactive [status|on|off|pause|resume]；长期任务优先使用 /agents mission run|halt。' }
}

const proactive = {
  type: 'local',
  name: 'proactive',
  description: '在本机会话启动、暂停或停止自主推进',
  argumentHint: '[status|on|off|pause|resume]',
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
} satisfies Command

export default proactive
