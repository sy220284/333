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

type View = 'home' | 'definitions' | 'tasks' | 'workflows'

function modeLabel(mode: AgentMode): string {
  return mode === 'super' ? '超级智能体团队' : '主智能体 + 子智能体'
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
            { label: '工作流及历史', value: 'workflows', description: '查看阶段执行和恢复记录' },
          ]}
          onChange={value => {
            if (value === 'master' || value === 'super') {
              setAgentMode(value)
              onDone('已切换到' + modeLabel(value) + '；模型、权限及已有任务继续沿用当前配置。', { display: 'system' })
            } else if (value === 'list') {
              void showAgentListing(context, onDone).catch(err => onDone('智能体列表读取失败：' + String(err), { display: 'system' }))
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
  if (verb === 'list') {
    await showAgentListing(context, onDone, [arg, ...rest].filter(Boolean).join(' ') || undefined)
    return null
  }
  if (verb === 'status') {
    const state = context.getAppState()
    const active = Object.values(state.tasks).filter(task =>
      (task.type === 'local_agent' || task.type === 'in_process_teammate') && task.status === 'running'
    ).length
    onDone('当前模式：' + modeLabel(getActiveAgentMode()) +
      '\n团队工具：' + (isAgentSwarmsEnabled() ? '已开放' : '已关闭') +
      '\n本会话运行中的智能体：' + active +
      '\n当前团队：' + (state.teamContext?.teamName ?? '无'), { display: 'system' })
    return null
  }
  if (verb === 'team-create' && arg && rest.length === 0) {
    const { TeamCreateTool } = await import('../../tools/TeamCreateTool/TeamCreateTool.js')
    const result = await TeamCreateTool.call({ team_name: arg }, context)
    onDone('团队已创建：' + result.data.team_name, { display: 'system' })
    return null
  }
  if (verb === 'team-delete' && !arg) {
    const { TeamDeleteTool } = await import('../../tools/TeamDeleteTool/TeamDeleteTool.js')
    const result = await TeamDeleteTool.call({}, context)
    onDone(result.data.message, { display: 'system' })
    return null
  }
  onDone('用法：/agents（交互管理）；/agents status；/agents mode master|super；/agents list [搜索词]；/agents team-create <团队名>；/agents team-delete。', { display: 'system' })
  return null
}
