import { z } from 'zod/v4'
import { resolve } from 'node:path'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { getCwd } from '../../utils/cwd.js'
import { isSuperAgentMode } from '../../utils/agentMode.js'
import {
  getSelectedMissionId, getMission, listMissions, formatMission,
  saveMissionCheckpoint, linkMissionAssignment, finishMissionAssignment,
  updateMissionStatus,
} from '../../utils/agentMissions.js'

const inputSchema = lazySchema(() => z.strictObject({
  action: z.enum(['list', 'show', 'checkpoint', 'attach', 'finish', 'status']),
  mission_id: z.string().optional(),
  checkpoint: z.string().optional(),
  assignment_id: z.string().optional(),
  kind: z.enum(['agent', 'workflow', 'team']).optional(),
  title: z.string().optional(),
  assignment_status: z.enum(['running', 'completed', 'failed', 'killed']).optional(),
  mission_status: z.enum(['active', 'paused', 'completed']).optional(),
}))
const outputSchema = lazySchema(() => z.strictObject({
  success: z.boolean(),
  text: z.string(),
}))
type InputSchema = ReturnType<typeof inputSchema>
type OutputSchema = ReturnType<typeof outputSchema>
type Input = z.infer<InputSchema>
type Output = z.infer<OutputSchema>

function required(value: string | undefined, label: string): string {
  if (!value?.trim()) throw new Error(`缺少 ${label}`)
  return value.trim()
}

async function execute(input: Input): Promise<string> {
  if (input.action === 'list') {
    const missions = (await listMissions()).filter(m => resolve(m.projectDir) === resolve(getCwd()))
    return missions.length ? missions.map(m => `${m.id} [${m.status}] ${m.objective}`).join('\n') : '本项目尚未创建超级智能体长期任务'
  }
  const selected = input.mission_id ?? getSelectedMissionId()
  const id = required(selected, '任务 ID，请先由用户通过 /agents mission new 创建')
  const mission = await getMission(id)
  if (resolve(mission.projectDir) !== resolve(getCwd())) throw new Error(`任务归属其他项目：${mission.projectDir}`)
  if (input.action === 'show') return formatMission(mission)
  if (input.action === 'checkpoint') {
    const checkpoint = required(input.checkpoint, '阶段记录')
    return formatMission(await saveMissionCheckpoint(id, checkpoint))
  }
  if (input.action === 'status') {
    if (!input.mission_status) throw new Error('缺少 mission_status')
    if (input.mission_status === 'active' && mission.status !== 'active')
      throw new Error('恢复已暂停或结束的长期任务，需要用户执行 /agents mission resume')
    return formatMission(await updateMissionStatus(id, input.mission_status))
  }
  if (input.action === 'attach') {
    const assignmentId = required(input.assignment_id, 'assignment_id')
    const title = required(input.title, 'title')
    if (!input.kind) throw new Error('缺少 kind')
    return formatMission(await linkMissionAssignment(id, assignmentId, input.kind, title))
  }
  if (input.action === 'finish') {
    const assignmentId = required(input.assignment_id, 'assignment_id')
    if (!input.assignment_status || input.assignment_status === 'running') throw new Error('完成关联任务需要终态 completed、failed 或 killed')
    return formatMission(await finishMissionAssignment(id, assignmentId, input.assignment_status))
  }
  throw new Error('不支持的任务操作')
}

/** User-authorized durable mission updates; never launches agents or timed jobs. */
export const MissionTool = buildTool({
  name: 'Mission',
  searchHint: 'inspect and update a persistent super-agent mission, checkpoint or assignment',
  shouldDefer: true,
  maxResultSizeChars: 50_000,
  userFacingName() { return 'Mission' },
  async description() { return '维护超级智能体本地长期任务：列出、查看、记录进度、关联执行、标记关联结果和任务状态。' },
  async prompt() { return 'Use only for an existing user-authorized mission. Checkpoint after verified progress; attach worker and workflow IDs; finish each assignment with an evidence-backed outcome. Pausing the mission prevents new assignments but does not stop existing running processes. No action creates an agent or scheduler.' },
  get inputSchema(): InputSchema { return inputSchema() },
  get outputSchema(): OutputSchema { return outputSchema() },
  isEnabled() { return isSuperAgentMode() },
  isConcurrencySafe() { return false },
  isReadOnly(input) { return input.action === 'list' || input.action === 'show' },
  toAutoClassifierInput(input) { return [input.action, input.mission_id, input.assignment_id].filter(Boolean).join(' ') },
  renderToolUseMessage(input) { return `长期任务 · ${input.action}` },
  async call(input) {
    return { data: { success: true, text: await execute(input) } }
  },
  mapToolResultToToolResultBlockParam(data: Output, toolUseID: string) {
    return { type: 'tool_result' as const, tool_use_id: toolUseID, content: data.text }
  },
} satisfies ToolDef<InputSchema, Output>)
