import * as React from 'react'
import { resolve } from 'node:path'
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
import { activateProactive, deactivateProactive, isProactiveActive, pauseProactive, resumeProactive } from '../../proactive/index.js'
import { createMission, formatMission, getMission, getSelectedMissionId, listMissions, selectMission, updateMissionStatus, saveMissionCheckpoint, linkMissionAssignment } from '../../utils/agentMissions.js'
import { enqueueMissionJob, listMissionJobs, approveMissionJob, retryMissionJob, cancelMissionJob, recoverMissionJob, missionJobAssignmentId } from '../../services/agentCenter/missionJobs.js'
import { finishMissionAssignment } from '../../utils/agentMissions.js'

type View = 'home' | 'definitions' | 'tasks' | 'workflows'

function modeLabel(mode: AgentMode): string {
  return mode === 'super' ? '超级智能体团队' : '主智能体 + 子智能体'
}

async function showMissions(onDone: LocalJSXCommandOnDone): Promise<void> {
  const missions = (await listMissions()).filter(m => resolve(m.projectDir) === resolve(getCwd()))
  const selected = getSelectedMissionId()
  onDone(missions.length ? missions.map(m =>
    `${(m.id === selected ? '* ' : '  ') + m.id} [${m.status}] ${m.objective.slice(0, 90)}`
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
              onDone(`已切换到${modeLabel(value)}；模型、权限及已有任务继续沿用当前配置。`, { display: 'system' })
            } else if (value === 'list') {
              void showAgentListing(context, onDone).catch(err => onDone(`智能体列表读取失败：${String(err)}`, { display: 'system' }))
            } else if (value === 'missions') {
              void showMissions(onDone).catch(err => onDone(`任务簿读取失败：${String(err)}`, { display: 'system' }))
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
  // The terminal opens the management panel; SDK and desktop callers receive a status snapshot.
  if (!value && context.options.isNonInteractiveSession) return call(onDone, context, 'status')
  if (!value) return <AgentCenter onDone={onDone} context={context} />
  const [verb, arg, ...rest] = value.split(/\s+/)
  if (verb === 'mode' && rest.length === 0 && (arg === 'master' || arg === 'super')) {
    setAgentMode(arg)
    onDone(`已切换到${modeLabel(arg)}。`, { display: 'system' })
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
      onDone(`已创建并选中超级智能体任务：${mission.id}\n目标：${mission.objective}`, { display: 'system' })
      return null
    }
    if (action === 'use' && value) {
      const mission = await getMission(value)
      if (resolve(mission.projectDir) !== resolve(getCwd())) throw new Error(`任务属于另一项目：${mission.projectDir}；请从该项目目录进入再选择。`)
      selectMission(mission.id)
      setAgentMode('super')
      onDone(`已选中任务：${mission.id}（${mission.status}）`, { display: 'system' })
      return null
    }
    if (action === 'clear' && !value) {
      deactivateProactive()
      selectMission()
      onDone('已停止自动推进并取消当前任务选择，原有档案仍保存在本地。', { display: 'system' })
      return null
    }
    const selected = getSelectedMissionId()
    if (selected && action === 'jobs' && !value) {
      const jobs = await listMissionJobs(selected, getCwd())
      onDone(jobs.length ? jobs.map(job =>
        `${job.id} [${job.status}] ${job.title} · 第 ${job.attempt} 次执行`
      ).join('\\n') : '本长期任务暂无工作项；使用 /agents mission queue 添加。', { display: 'system' })
      return null
    }
    if (selected && action === 'queue' && value) {
      const split = value.indexOf(' :: ')
      if (split < 1) throw new Error('用法：/agents mission queue <标题> :: <完整指令>')
      const mission = await getMission(selected)
      if (mission.status !== 'active') throw new Error('当前长期任务已暂停或完成')
      if (resolve(mission.projectDir) !== resolve(getCwd())) throw new Error('任务归属其他项目')
      const job = await enqueueMissionJob(selected, getCwd(), value.slice(0, split), value.slice(split + 4))
      try {
        await linkMissionAssignment(selected, missionJobAssignmentId(job.id), 'agent', job.title)
      } catch (error) {
        await cancelMissionJob(selected, getCwd(), job.id)
        throw error
      }
      onDone(`已保存工作项 ${job.id}（待执行）；可在桌面智能体工作台启动。`, { display: 'system' })
      return null
    }
    if (selected && ['approve', 'retry', 'recover', 'cancel'].includes(action) && value) {
      const mission = await getMission(selected)
      if (resolve(mission.projectDir) !== resolve(getCwd())) throw new Error('任务归属其他项目')
      if (action === 'retry' && mission.status !== 'active') throw new Error('请先恢复长期任务')
      const job = action === 'approve'
        ? await approveMissionJob(selected, getCwd(), value)
        : action === 'retry'
          ? await retryMissionJob(selected, getCwd(), value)
          : action === 'recover'
            ? await recoverMissionJob(selected, getCwd(), value)
            : await cancelMissionJob(selected, getCwd(), value)
      if (action === 'approve' || action === 'cancel') {
        await finishMissionAssignment(selected, missionJobAssignmentId(job.id),
          action === 'approve' ? 'completed' : 'killed')
      }
      onDone(`工作项 ${job.id} 状态：${job.status}`, { display: 'system' })
      return null
    }
    if (selected && action === 'show' && !value) {
      onDone(formatMission(await getMission(selected)), { display: 'system' })
      return null
    }
    if (selected && action === 'halt' && !value) {
      deactivateProactive()
      onDone('已停止本会话的持续唤醒；已运行的工具任务继续按 /tasks 管理，长期任务档案保留。', { display: 'system' })
      return null
    }
    if (selected && action === 'run' && !value) {
      const mission = await getMission(selected)
      if (mission.status !== 'active') throw new Error('请先执行 /agents mission resume，恢复长期任务授权')
      setAgentMode('super')
      if (isProactiveActive()) resumeProactive()
      else activateProactive('command')
      onDone(`持续执行已启动（仅本地当前进程）：${mission.id}；使用 /agents mission halt 停止自动唤醒。`, {
        display: 'system',
        nextInput: `继续已授权的超级智能体长期任务 ${mission.id}。目标：${mission.objective}。已有进度：${mission.checkpoint || '无'}。优先核实关联执行结果，再处理未完成事项；所有外部修改继续服从工具权限审批，工作结束后记录检查点。`,
        submitNextInput: true,
      })
      return null
    }
    if (selected && action === 'continue') {
      const mission = await getMission(selected)
      if (mission.status !== 'active') {
        throw new Error(`任务状态为 ${mission.status}，请先执行 /agents mission resume`)
      }
      setAgentMode('super')
      const additional = value ? `用户补充要求：${value}\n` : ''
      const nextInput = '继续已授权的超级智能体长期任务 ' + mission.id +
        '。目标：' + mission.objective + '\n' +
        '已有阶段记录：' + (mission.checkpoint || '尚无记录') + '\n' +
        additional +
        '请先检查任务档案和关联执行状态，复用已有成果，处理未完成工作；需要外部执行时按现有权限规则审批，并在实际核验后更新 Mission 阶段记录及结果。'
      onDone(`已读取长期任务档案，开始按当前用户指令继续：${mission.id}`, {
        display: 'system', nextInput, submitNextInput: true,
      })
      return null
    }
    if (selected && ['pause', 'resume', 'done'].includes(action) && !value) {
      const status = action === 'pause' ? 'paused' : action === 'resume' ? 'active' : 'completed'
      const mission = await updateMissionStatus(selected, status)
      if (status === 'paused') pauseProactive()
      if (status === 'completed') deactivateProactive()
      if (status === 'active' && isProactiveActive()) resumeProactive()
      onDone(`任务状态已更新：${mission.id} → ${mission.status}${status === 'paused' ? '\n已暂停新执行关联和自动唤醒；现有 Agent 和 Workflow 可从 /tasks 管理。' : ''}`, { display: 'system' })
      return null
    }
    if (selected && action === 'note' && value) {
      const mission = await saveMissionCheckpoint(selected, value)
      onDone(`已记录任务阶段：${mission.id}，下次会话可继续读取。`, { display: 'system' })
      return null
    }
    if (selected && action === 'attach' && rest.length >= 3) {
      const [kind, taskId, ...titleParts] = rest
      if (kind !== 'agent' && kind !== 'team' && kind !== 'workflow') throw new Error('关联类型须为 agent、team 或 workflow')
      if (!taskId) throw new Error('任务 ID 不能为空')
      await linkMissionAssignment(selected, taskId, kind, titleParts.join(' '))
      onDone(`已关联执行任务：${taskId}`, { display: 'system' })
      return null
    }
    onDone('用法：/agents mission new <目标>；/agents mission jobs；/agents mission queue <标题> :: <执行指令>；/agents mission approve|retry|recover|cancel <工作项ID>；/agents mission show|pause|resume|done|continue|run|halt；/agents mission note <进度>。', { display: 'system' })
    return null
  }
  if (verb === 'list') {
    await showAgentListing(context, onDone, [arg, ...rest].filter(Boolean).join(' ') || undefined)
    return null
  }
  if (verb === 'status') {
    const state = context.getAppState()
    const activeAgents = Object.values(state.tasks).filter(task =>
      (task.type === 'local_agent' || task.type === 'in_process_teammate') && task.status === 'running'
    ).length
    const activeWorkflows = Object.values(state.tasks).filter(task =>
      task.type === 'local_workflow' && task.status === 'running'
    ).length
    const selectedMission = getSelectedMissionId()
    const mission = selectedMission ? await getMission(selectedMission) : undefined
    if (mission && resolve(mission.projectDir) !== resolve(getCwd()))
      throw new Error(`当前长期任务归属其他项目：${mission.projectDir}`)
    const pending = mission?.assignments.filter(assignment => assignment.status === 'running').length ?? 0
    onDone('当前模式：' + modeLabel(getActiveAgentMode()) +
      '\n团队工具：' + (isAgentSwarmsEnabled() ? '已开放' : '已关闭') +
      '\n本会话运行中的智能体：' + activeAgents +
      '\n本会话运行中的工作流：' + activeWorkflows +
      '\n当前团队：' + (state.teamContext?.teamName ?? '无') +
      '\n当前任务簿：' + (selectedMission ?? '无') +
      (mission ? `（${mission.status}，待核实关联执行 ${pending} 项）` : ''),
      { display: 'system' })
    return null
  }
  if (verb === 'team-create' && arg && rest.length === 0) {
    if (!isAgentSwarmsEnabled()) throw new Error('团队协作已由本地设置关闭，请先启用多智能体协作。')
    const { TeamCreateTool } = await import('../../tools/TeamCreateTool/TeamCreateTool.js')
    if (!context.canUseTool) throw new Error('当前命令上下文缺少工具权限检查接口')
    const result = await TeamCreateTool.call({ team_name: arg }, context, context.canUseTool, undefined)
    onDone(`团队已创建：${result.data.team_name}`, { display: 'system' })
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
