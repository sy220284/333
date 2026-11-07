/**
 * Model-accessible self-extension proposal. Creating a candidate Skill is
 * inert; publication and activation remain explicit trusted UI operations.
 */
import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { getMissionExecutionProjectDir } from '../../utils/agentMissions.js'
import { createSkillDraft, listSkillDrafts } from '../../services/agentCenter/skillWorkshop.js'

const inputSchema=lazySchema(()=>z.strictObject({
  action:z.enum(['list','draft-skill']),
  slug:z.string().regex(/^[a-z][a-z0-9-]{2,63}$/).optional(),
  description:z.string().trim().min(12).max(240).optional(),
  instructions:z.string().trim().min(60).max(20000).optional(),
}))
const outputSchema=lazySchema(()=>z.strictObject({success:z.boolean(),text:z.string()}))
type InputSchema=ReturnType<typeof inputSchema>
type OutputSchema=ReturnType<typeof outputSchema>
type Input=z.infer<InputSchema>
type Output=z.infer<OutputSchema>

async function run(input:Input):Promise<string>{
  const project=getMissionExecutionProjectDir()
  if(input.action==='list'){
    const drafts=await listSkillDrafts(project)
    return drafts.length?drafts.map(x=>`${x.slug} [${x.state}] ${x.id}`).join('\n'):
      '当前项目没有等待审核的自创技能候选'
  }
  if(!input.slug||!input.description||!input.instructions)
    throw new Error('创建技能候选需要名称、用途描述、详细适用条件、复用步骤和验收规范')
  const draft=await createSkillDraft(project,{
    slug:input.slug,description:input.description,instructions:input.instructions,
  })
  return `已创建待审核技能候选：${draft.slug}（${draft.id}）。用户可在桌面能力中心检查后发布；此操作未安装或运行技能。`
}

export const CapabilityDraftTool=buildTool({
  name:'CapabilityDraft',
  searchHint:'propose an original reusable local skill for a missing capability, pending user approval',
  shouldDefer:true,
  maxResultSizeChars:20_000,
  async description(){return '为缺失的任务能力创建可审查的本地技能候选；不会自动发布或执行。'},
  async prompt(){return 'First discover existing Skill, MCP, Tool and Workflow capabilities. If the goal cannot be fulfilled by existing capabilities, propose a focused reusable Skill with a lowercase slug, factual description and detailed instructions. Instructions must include applicability, inputs, ordered steps, expected outputs, verification and invalid conditions. Use action draft-skill to save a candidate for user review. Never claim that draft creation installs, approves or runs a skill. Publication and new executable permissions require explicit user action.'},
  get inputSchema():InputSchema{return inputSchema()},
  get outputSchema():OutputSchema{return outputSchema()},
  isConcurrencySafe(input){return input.action==='list'},
  isReadOnly(input){return input.action==='list'},
  toAutoClassifierInput(input){return `${input.action} ${input.slug??''}`},
  renderToolUseMessage(input){return `能力草稿 · ${input.action}`},
  async call(input){return {data:{success:true,text:await run(input)}}},
  mapToolResultToToolResultBlockParam(data:Output,toolUseID:string){
    return {type:'tool_result' as const,tool_use_id:toolUseID,content:data.text}
  },
} satisfies ToolDef<InputSchema,Output>)
