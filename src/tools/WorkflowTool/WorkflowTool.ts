import { z } from 'zod/v4'
import { join, resolve, sep } from 'node:path'
import { readFile, realpath } from 'node:fs/promises'
import { getCwd } from '../../utils/cwd.js'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { validateWorkflowScript } from './workflowRuntime.mjs'
import { launchWorkflow } from '../../tasks/LocalWorkflowTask/LocalWorkflowTask.js'

const inputSchema=lazySchema(()=>z.strictObject({
  script:z.string().optional().describe('Deterministic workflow script with export const meta'),
  name:z.string().optional().describe('Workflow file name in .claude/workflows'),
  args:z.record(z.string(),z.unknown()).optional(),
  scriptPath:z.string().optional().describe('Workflow file under the current workspace'),
  resumeFromRunId:z.string().optional(),
}))
type InputSchema=ReturnType<typeof inputSchema>
const outputSchema=lazySchema(()=>z.object({
  status:z.literal('async_launched'),
  taskId:z.string(),taskType:z.literal('local_workflow'),
  workflowName:z.string(),runId:z.string(),
  summary:z.string(),transcriptDir:z.string(),scriptPath:z.string(),
}))
type OutputSchema=ReturnType<typeof outputSchema>
type Output=z.infer<OutputSchema>
async function resolveScript(input:z.infer<InputSchema>) {
  if(input.script!==undefined)return input.script
  if(input.resumeFromRunId && !input.scriptPath && !input.name){
    if(!/^wf_[a-f0-9]{12}$/.test(input.resumeFromRunId))throw new Error('Invalid resumeFromRunId')
    return readFile(join(getClaudeConfigHomeDir(),'workflow-runs',input.resumeFromRunId,'script.mjs'),'utf8')
  }
  const root=await realpath(getCwd())
  const candidate=input.scriptPath?resolve(root,input.scriptPath):
    input.name&&/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(input.name)?
      join(root,'.claude','workflows',`${input.name}.mjs`):null
  if(!candidate)throw new Error('Provide a workflow script, name, or scriptPath')
  const path=await realpath(candidate)
  if(!path.startsWith(root+sep))throw new Error('Workflow script path is outside the trusted workspace')
  return readFile(path,'utf8')
}
export const WorkflowTool=buildTool({
  name:'Workflow',aliases:['RunWorkflow'],
  searchHint:'orchestrate subagents with deterministic JavaScript workflow',
  enablesCodeExecution:true,shouldDefer:true,
  maxResultSizeChars:100000,
  userFacingName(){return 'Workflow'},
  async description(){return 'Run a deterministic multi-step workflow with phases, agent, parallel and pipeline. Resume a previous workflow from its run ID.'},
  async prompt(){return 'Create a script with export const meta = {name,description,phases}. Use phase(title), agent(prompt, options), parallel([...]), pipeline(items,...stages), log(...). Dynamic workflows always require user permission. Resume with resumeFromRunId.'},
  get inputSchema():InputSchema{return inputSchema()},
  get outputSchema():OutputSchema{return outputSchema()},
  isEnabled(){return true},
  isConcurrencySafe(){return false},
  isReadOnly(){return false},
  toAutoClassifierInput(input){return input.script??input.scriptPath??input.name??input.resumeFromRunId??''},
  renderToolUseMessage(input){return input.name??input.scriptPath??'dynamic workflow'},
  async validateInput(input){
    try{
      if(input.resumeFromRunId && !/^wf_[a-f0-9]{12}$/.test(input.resumeFromRunId))throw new Error('Invalid resumeFromRunId')
      const script=await resolveScript(input)
      validateWorkflowScript(script)
      return {result:true as const}
    }catch(error){return {result:false as const,message:error instanceof Error?error.message:String(error),errorCode:9}}
  },
  async checkPermissions(input){
    const script=await resolveScript(input)
    const parsed=validateWorkflowScript(script)
    return {behavior:'ask' as const,
      message:`Review dynamic workflow before running: ${parsed.meta.name} — ${parsed.meta.description}\n\n${script}`,
      updatedInput:input,
      decisionReason:{type:'safetyCheck' as const,reason:'Workflow can launch agents and run user-approved code',classifierApprovable:false}}
  },
  async call(input,context,canUseTool){
    const script=await resolveScript(input)
    const parsed=validateWorkflowScript(script)
    const result=await launchWorkflow({script,args:input.args,resumeFromRunId:input.resumeFromRunId,scriptPath:input.scriptPath},context,canUseTool)
    return {data:{status:'async_launched' as const,taskId:result.taskId,taskType:'local_workflow' as const,
      workflowName:result.workflowName,runId:result.runId,summary:parsed.meta.description,
      transcriptDir:result.transcriptDir,scriptPath:result.scriptPath}}
  },
  mapToolResultToToolResultBlockParam(data:Output,toolUseID:string){
    return {type:'tool_result' as const,tool_use_id:toolUseID,
      content:`Workflow launched in background. Task ID: ${data.taskId}\nSummary: ${data.summary}\nTranscript dir: ${data.transcriptDir}\nScript file: ${data.scriptPath}\nRun ID: ${data.runId}\nUse TaskStop to cancel or resumeFromRunId to resume after completion.`}
  },
} satisfies ToolDef<InputSchema,Output>)
