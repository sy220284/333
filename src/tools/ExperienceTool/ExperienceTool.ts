/**
 * Model-accessible normative learning. Models can only propose experience
 * candidates; human approval is handled by the trusted desktop UI.
 * No tool invocation can mark an experience as approved.
 */
import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { getMissionExecutionProjectDir } from '../../utils/agentMissions.js'
import {
  findRelevantExperiences, listProjectExperiences, proposeProjectExperience,
  validateExperienceDraft,
} from '../../services/agentCenter/experienceMemory.js'

const inputSchema = lazySchema(() => z.strictObject({
  action: z.enum(['recall','list','propose']),
  query: z.string().trim().min(1).max(300).optional(),
  draft: z.unknown().optional(),
}))
const outputSchema = lazySchema(() => z.strictObject({
  success: z.boolean(),
  text: z.string(),
}))
type InputSchema = ReturnType<typeof inputSchema>
type OutputSchema = ReturnType<typeof outputSchema>
type Input = z.infer<InputSchema>
type Output = z.infer<OutputSchema>

async function execute(input: Input): Promise<string> {
  const projectDir = getMissionExecutionProjectDir()
  if (input.action === 'recall') {
    if (!input.query) throw new Error('请提供正在解决的问题或专业场景')
    const matches = await findRelevantExperiences(projectDir,input.query)
    return matches.length
      ? matches.map(item => [
          item.title,
          '适用场景：'+item.scenario,
          '核心原则：'+item.principle,
          '操作规范：'+item.procedure.map((p,i)=>(i+1)+'. '+p).join('；'),
          '适用：'+item.applicability,
          '失效：'+item.invalidWhen,
          '验收：'+item.verification,
          '证据：'+item.evidenceRefs.join('、'),
        ].join('\n')).join('\n\n')
      : '没有找到经过人工审核且与当前任务相关的经验规范'
  }
  if (input.action === 'list') {
    const approved = await listProjectExperiences(projectDir)
    return approved.length
      ? approved.map(item => item.key+'：'+item.title+'（已核验）').join('\n')
      : '本项目尚无经过审核的经验规范'
  }
  if (input.draft === undefined) throw new Error('提炼经验须提供完整规范对象')
  const prepared = validateExperienceDraft(input.draft)
  const candidate = await proposeProjectExperience(projectDir,prepared)
  return '已提交候选规范 '+candidate.id+'：'+candidate.title+'。只有用户核对真实证据并明确审核后才用于长期召回。'
}

export const ExperienceTool = buildTool({
  name: 'Experience',
  searchHint: 'recall approved project practices or propose a reusable procedure from verified results',
  shouldDefer: true,
  maxResultSizeChars: 30_000,
  async description() {
    return '检索已验证的项目经验规范，或把经核查的工作成果提炼成待审核的可复用规范。'
  },
  async prompt() {
    return 'Experience memory stores durable rules, not conversation summaries or daily logs. Use recall before repeating complex work. Only propose after actual verified work. A candidate needs scenario, principle, procedure, applicability, invalidWhen, verification, evidenceRefs and tags. Evidence must refer to real artifacts, tests or source records. Never invent verification; never claim proposed knowledge was approved. Only the user can approve or retire normative memory.'
  },
  get inputSchema(): InputSchema { return inputSchema() },
  get outputSchema(): OutputSchema { return outputSchema() },
  isConcurrencySafe(input) { return input.action !== 'propose' },
  isReadOnly(input) { return input.action !== 'propose' },
  toAutoClassifierInput(input) { return input.action+' '+(input.query??'') },
  renderToolUseMessage(input) { return '经验规范 · '+input.action },
  async call(input) { return { data: { success:true, text: await execute(input) } } },
  mapToolResultToToolResultBlockParam(data:Output, toolUseID:string) {
    return {type:'tool_result' as const,tool_use_id:toolUseID,content:data.text}
  },
} satisfies ToolDef<InputSchema,Output>)
