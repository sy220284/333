import * as React from 'react'
import { useState } from 'react'
import type { LocalJSXCommandContext, LocalJSXCommandOnDone } from '../../types/command.js'
import { BackgroundTasksDialog } from '../../components/tasks/BackgroundTasksDialog.js'
import { WorkflowHistoryDialog } from '../../components/tasks/WorkflowHistoryDialog.js'
import { AgentsMenu } from '../../components/agents/AgentsMenu.js'
import { Select } from '../../components/CustomSelect/select.js'
import { Dialog } from '../../components/design-system/Dialog.js'
import { Box, Text } from '../../ink.js'
import { getActiveAgentMode, setAgentMode, type AgentMode } from '../../utils/agentMode.js'
import { isAgentSwarmsEnabled } from '../../utils/agentSwarmsEnabled.js'
import { getCwd } from '../../utils/cwd.js'
import { createMission, formatMission, getMission, getSelectedMissionId, listMissions, selectMission, updateMissionStatus, saveMissionCheckpoint, linkMissionAssignment } from '../../utils/agentMissions.js'

type View = 'home' | 'definitions' | 'tasks' | 'workflows'

function modeLabel(mode: AgentMode): string {
  return mode === 'super' ? '超级智能体团队' : '主智能体 + 子智能体'
}

async function showMissions(onDone: LocalJSXCommandOnDone): Promise<void> {
  const missions = await listMissions()
  const selected = getSelectedMissionId()
  onDone(missions.length ? missions.map(m =>
    (m.id === selected ? '* ' : '  ') + m.id + ' [' + m.status + '] ' + m.objective.slice(0, 90)
  ).join('\n') : '尚无超级智能体长期任务。使用 /agents mission new <任务目标> 创建。', { display: 'system' })
}

async function showAgentListing(context: LocalJSXCommandContext, onDone: LocalJSXCommandOnDone, query?: string): Promise<void> {
  const { ListAgentsTool } = await import('../../tools/ListAgentsTool/ListAgentsTool.js')
  const result = await ListAgentsTool.call({ q: query }, context)
  onDone(result.data.listing, { display: 'system' })
}

function AgentCenter({ context, onDone }: { context: LocalJSXCommandContext; onDone: LocalJSXCommandOnDone }): React.ReactNode {
  const [view, setView] = useState<View>('home')
  if (view === 'definitions') return <AgentsMenu tools={context.options.tools} onExit={() => setView('home')} />
  if (view === 'tasks') return <BackgroundTasksDialog toolUseContext={context} onDone={() => setView('home')} />
  if (view === 'workflows') return <WorkflowHistoryDialog toolUseContext={context} onDone={() => setView('home')} />
  return (
    <Dialog title="摇摇车 · 智能体协作中心" onCancel={() => onDone()}>
      <Box flexDirection="column" gap={1}>
        <Text>当前模式：{modeLabel(getActiveAgentMode())}</Text>
        <Text>团队工具：{isAgentSwarmsEnabled() ? '已开放' : '已关闭'}</Text>
        <Select
          options={[
            { label: '主从智能体模式', value: 'master', description: '一个主智能体负责分工、检查和交付' },
            { label: '超级智能体团队模式', value: 'super', description: '协调者调度 Worker、团队成员与持续任务' },
            { label: '管理智能体定义', value: 'definitions', description: '复用既有智能体编辑器和角色设置' },
            { label: '查看可通信智能体', value: 'list', description: '子智能体、团队成员和本机会话' },
            { label: '后台任务和成员', value: 'tasks', description: '查看、停止或恢复已有任务' },
            { label: '长期任务档案', value: 'missions', description: '查看目标、执行记录和恢复上下文' },
            { label: '工作流及历史', value: 'workflows', description: '查看阶段执行和恢复记录' },
          ]}
          onChange={value => {
            if (value === 'master' || value === 'super') {
              setAgentMode(value)
              onDone('已切换到' + modeLabel(value) + '；模型、权限及已有任务继续沿用当前配置。', { display: 'system' })
            } else if (value === 'list') {
              void showAgentListing(context, onDone).catch(err => onDone('智能体列表读取失败：' + String(err), { display: 'system' }))
            } else if (value === 'missions') {
              void showMissions(onDone).catch(err => onDone('任务簿读取失败：' + String(err), { display: 'system' }))
            } else if (value === 'definitions' || value === 'tasks' || value === 'workflows') {
              setView(value)
            }
          }}
          onCancel={() => onDone()}
        />
      </Box>
    </Dialog>
  )
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: LocalJSXCommandContext,
  args: string,
): Promise<React.ReactNode> {
  const value = args.trim()
  if (!value) return <AgentCenter onDone={onDone} context={context} />
  const [verb, arg, ...rest] = value.split(/\s+/)
  if (verb === 'mode' && rest.length === 0 && (arg === 'master' || arg === 'super')) {
    setAgentMode(arg)
    onDone('已切换到' + modeLabel(arg) + '。', { display: 'system' })
    return null
  }
  if (verb === 'missions' && !arg) {
    await showMissions(onDone)
    return null
  }
  if (verb === 'mission') {
    const action = arg ?? 'show'
    const value = rest.join(' ').trim()
    if (action === 'new' && value) {
      const mission = await createMission(value, getCwd())
      selectMission(mission.id)
      setAgentMode('super')
      onDone('已创建并选中超级智能体任务：' + mission.id + '\n目标：' + mission.objective, { display: 'system' })
      return null
    }
    if (action === 'use' && value) {
      const mission = await getMission(value)
      if (mission.projectDir !== getCwd()) throw new Error('任务属于另一项目：' + mission.projectDir + '；请从该项目目录进入再选择。')
      selectMission(mission.id)
      onDone('已选中任务：' + mission.id + '（' + mission.status + '）', { display: 'system' })
      return null
    }
    if (action === 'clear' && !value) {
      selectMission()
      onDone('已取消当前任务选择，原有档案仍保存在本地。', { display: 'system' })
      return null
    }
    const selected = getSelectedMissionId()
    if (selected && action === 'show' && !value) {
      onDone(formatMission(await getMission(selected)), { display: 'system' })
      return null
    }
    if (selected && action === 'continue') {
      const mission = await getMission(selected)
      if (mission.status !== 'active') {
        throw new Error('任务状态为 ' + mission.status + '，请先执行 /agents mission resume')
      }
      setAgentMode('super')
      const additional = value ? '用户补充要求：' + value + '\n' : ''
      const nextInput = '继续已授权的超级智能体长期任务 ' + mission.id +
        '。目标：' + mission.objective + '\n' +
        '已有阶段记录：' + (mission.checkpoint || '尚无记录') + '\n' +
        additional +
        '请先检查任务档案和关联执行状态，复用已有成果，处理未完成工作；需要外部执行时按现有权限规则审批，并在实际核验后更新 Mission 阶段记录及结果。'
      onDone('已读取长期任务档案，开始按当前用户指令继续：' + mission.id, {
        display: 'system', nextInput, submitNextInput: true,
      })
      return null
    }
    if (selected && ['pause', 'resume', 'done'].includes(action) && !value) {
      const status = action === 'pause' ? 'paused' : action === 'resume' ? 'active' : 'completed'
      const mission = await updateMissionStatus(selected, status)
      onDone('任务状态已更新：' + mission.id + ' → ' + mission.status + (status === 'paused' ? '\n已暂停新执行关联；现有 Agent 和 Workflow 仍按其独立生命周期运行，可从 /tasks 管理。' : ''), { display: 'system' })
      return null
    }
    if (selected && action === 'note' && value) {
      const mission = await saveMissionCheckpoint(selected, value)
      onDone('已记录任务阶段：' + mission.id + '，下次会话可继续读取。', { display: 'system' })
      return null
    }
    if (selected && action === 'attach' && rest.length >= 3) {
      const [kind, taskId, ...titleParts] = rest
      if (kind !== 'agent' && kind !== 'team' && kind !== 'workflow') throw new Error('关联类型须为 agent、team 或 workflow')
      await linkMissionAssignment(selected, taskId!, kind, titleParts.join(' '))
      onDone('已关联执行任务：' + taskId, { display: 'system' })
      return null
    }
    onDone('用法：/agents mission new <目标>；/agents missions；/agents mission use <ID>；/agents mission show|pause|resume|done|clear|continue [新要求]；/agents mission note <阶段记录>；/agents mission attach <agent|team|workflow> <任务ID> <标题>。', { display: 'system' })
    return null
  }
  if (verb === 'list') {
    await showAgentListing(context, onDone, [arg, ...rest].filter(Boolean).join(' ') || undefined)
    return null
  }
  if (verb === 'status') {
    const state = context.getAppState()
    const active = Object.values(state.tasks).filter(task =>
      (task.type === 'local_agent' || task.type === 'in_process_teammate') && task.status === 'running'
    ).length
    const selectedMission = getSelectedMissionId()
    onDone('当前模式：' + modeLabel(getActiveAgentMode()) +
      '\n团队工具：' + (isAgentSwarmsEnabled() ? '已开放' : '已关闭') +
      '\n本会话运行中的智能体：' + active +
      '\n当前团队：' + (state.teamContext?.teamName ?? '无') +
      '\n当前任务簿：' + (selectedMission ?? '无'), { display: 'system' })
    return null
  }
  if (verb === 'team-create' && arg && rest.length === 0) {
    const { TeamCreateTool } = await import('../../tools/TeamCreateTool/TeamCreateTool.js')
    if (!context.canUseTool) throw new Error('当前命令上下文缺少工具权限检查接口')
    const result = await TeamCreateTool.call({ team_name: arg }, context, context.canUseTool, undefined)
    onDone('团队已创建：' + result.data.team_name, { display: 'system' })
    return null
  }
  if (verb === 'team-delete' && !arg) {
    const { TeamDeleteTool } = await import('../../tools/TeamDeleteTool/TeamDeleteTool.js')
    if (!context.canUseTool) throw new Error('当前命令上下文缺少工具权限检查接口')
    const result = await TeamDeleteTool.call({}, context, context.canUseTool, undefined)
    onDone(result.data.message, { display: 'system' })
    return null
  }
  onDone('用法：/agents（交互管理）；/agents status；/agents mode master|super；/agents list [搜索词]；/agents team-create <团队名>；/agents team-delete；/agents mission new <目标>；/agents missions。', { display: 'system' })
  return null
}
