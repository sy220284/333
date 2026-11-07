import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { getMissionExecutionProjectDir } from '../../utils/agentMissions.js'
import { getAgentName, getTeamName, isTeammate } from '../../utils/teammate.js'
import { readMailbox } from '../../utils/teammateMailbox.js'
import { listTeamHandoffs, changeTeamHandoff } from '../../services/agentCenter/teamHandoffs.js'

const inputSchema = lazySchema(() => z.strictObject({
  action: z.enum(['list', 'acknowledge', 'start', 'submit']),
  handoffId: z.string().uuid().optional(),
  outputRefs: z.array(z.string().trim().min(3).max(400)).min(1).max(30).optional(),
}))
const outputSchema = lazySchema(() => z.strictObject({
  success: z.boolean(), text: z.string(),
}))
type InputSchema = ReturnType<typeof inputSchema>
type OutputSchema = ReturnType<typeof outputSchema>
type Input = z.infer<InputSchema>
type Output = z.infer<OutputSchema>

async function execute(input: Input): Promise<string> {
  const person = getAgentName()
  const team = getTeamName()
  if (!isTeammate() || !person || !team || person === 'team-lead')
    throw new Error('只有原生团队成员可以签收并提交自己的交接任务')
  const projectDir = getMissionExecutionProjectDir()
  const jobs = (await listTeamHandoffs(projectDir))
    .filter(item => item.teamName === team && item.to === person)
  if (input.action === 'list') {
    return jobs.length ? jobs.map(item =>
      `${item.id} [${item.status}] ${item.summary}；任务：${item.instruction}`
    ).join('\n') : '当前成员没有等待处理的交接任务'
  }
  if (!input.handoffId) throw new Error('请提供实际收到的交接编号')
  const handoff = jobs.find(item => item.id === input.handoffId)
  if (!handoff) throw new Error('交接不属于当前成员或项目')
  if (handoff.status === 'draft') throw new Error('交接尚未成功写入原生信箱')
  const inbox = await readMailbox(person, team)
  if (!inbox.some(message =>
    message.messageId === handoff.id && message.from === 'team-lead' &&
    message.text.includes(`交接编号：${handoff.id}`)))
    throw new Error('当前原生信箱没有对应交接消息，请联系团队负责人重试')
  const state = input.action === 'acknowledge' ? 'acknowledged'
    : input.action === 'start' ? 'running' : 'review'
  const accepted = await changeTeamHandoff(projectDir, handoff.id, state, person,
    state === 'review' ? { outputRefs: input.outputRefs } : {})
  return `已更新交接 ${accepted.id}，状态 ${accepted.status}。${state === 'review' ? '已提交成果引用，等待负责人实际核验。' : ''}`
}
export const HandoffTool = buildTool({
  name: 'Handoff',
  searchHint: 'teammate acknowledges, starts and submits a tracked project handoff',
  shouldDefer: true,
  maxResultSizeChars: 16000,
  async description() { return '团队成员签收任务、标记执行状态并提交成果供负责人核验。' },
  async prompt() {
    return 'When a teammate receives a handoff ID, acknowledge after verifying the native inbox, then start before executing. After producing actual output, submit real artifact references. Final acceptance is reserved for explicit user review. Never treat queued delivery as task completion.'
  },
  get inputSchema(): InputSchema { return inputSchema() },
  get outputSchema(): OutputSchema { return outputSchema() },
  isEnabled() { return isTeammate() },
  isConcurrencySafe(input) { return input.action === 'list' },
  isReadOnly(input) { return input.action === 'list' },
  toAutoClassifierInput(input) { return input.action },
  renderToolUseMessage(input) { return `团队交接 · ${input.action}` },
  async call(input) { return { data: { success: true, text: await execute(input) } } },
  mapToolResultToToolResultBlockParam(data: Output, toolUseID: string) {
    return { type: 'tool_result' as const, tool_use_id: toolUseID, content: data.text }
  },
} satisfies ToolDef<InputSchema, Output>)
