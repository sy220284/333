import { z } from 'zod/v4'
import { join, resolve, sep } from 'node:path'
import { readFile, realpath } from 'node:fs/promises'
import { getCwd } from '../../utils/cwd.js'
import { getSessionProjectDir, getOriginalCwd } from '../../bootstrap/state.js'
import { getProjectDir } from '../../utils/sessionStorage.js'
import { workflowRunDirectory, workflowSessionScripts } from '../../tasks/LocalWorkflowTask/workflowStoragePaths.mjs'
import { getSessionId } from '../../bootstrap/state.js'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { validateWorkflowScript } from './workflowRuntime.mjs'
import { launchWorkflow } from '../../tasks/LocalWorkflowTask/LocalWorkflowTask.js'

const inputSchema=lazySchema(()=>z.strictObject({
  script:z.string().max(524288).optional().describe('Self-contained workflow script. Must begin with `export const meta = { name, description, phases }` (pure literal, no computed values) followed by the script body using agent()/parallel()/pipeline()/phase().'),
  name:z.string().optional().describe('Name of a predefined workflow (built-in or from .claude/workflows/). Resolves to a self-contained script.'),
  description:z.string().optional().describe('Ignored — set the workflow description in the script\'s `meta` block.'),
  title:z.string().optional().describe('Ignored — set the workflow title in the script\'s `meta` block.'),
  args:z.unknown().optional().describe('Optional input value exposed to the script as the global `args`, verbatim. Pass arrays/objects as actual JSON values, NOT as a JSON-encoded string — a stringified list breaks `args.filter`/`args.map` in the script. Use for parameterized named workflows (e.g. a research question).'),
  scriptPath:z.string().optional().describe('Path to a workflow script file on disk. Every Workflow invocation persists its script under the session directory and returns the path in the tool result. To iterate, edit that file with Write/Edit and re-invoke Workflow with the same `scriptPath` instead of re-sending the full script. Takes precedence over `script` and `name`.'),
  resumeFromRunId:z.string().regex(/^wf_[a-z0-9-]{6,}$/).optional().describe('Run ID of a prior Workflow invocation to resume from. Completed agent() calls with unchanged (prompt, opts) return their cached results instantly; only edited or new calls re-run. Same-session only. Stop the prior run first (TaskStop) before resuming.'),
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
  if(input.scriptPath){
    const workspace=await realpath(getCwd())
    const path=await realpath(resolve(workspace,input.scriptPath))
    const isWorkspaceFile=path.startsWith(workspace+sep)
    const projectDir=getSessionProjectDir()??getProjectDir(getOriginalCwd())
    const scriptDir=workflowSessionScripts(projectDir,getSessionId())
    const runId=/-((?:wf_[0-9a-f]{8}-[0-9a-f]{3}))\.js$/.exec(path)?.[1]
    const isStoredWorkflow=path.startsWith(scriptDir+sep)&&!!runId
    if(!isWorkspaceFile&&!isStoredWorkflow)throw new Error('Workflow script path is outside the workspace or session workflow directory')
    if(isStoredWorkflow){
      const metadata=JSON.parse(await readFile(join(workflowRunDirectory(projectDir,getSessionId(),runId),'metadata.json'),'utf8'))
      if(metadata.sessionId!==getSessionId()||metadata.scriptPath!==path)
        throw new Error('Workflow script belongs to another session')
    }
    return readFile(path,'utf8')
  }
  if(input.script!==undefined)return input.script
  if(input.resumeFromRunId && !input.name){
    if(!/^wf_[a-z0-9-]{6,}$/.test(input.resumeFromRunId))throw new Error('Invalid resumeFromRunId')
    const projectDir=getSessionProjectDir()??getProjectDir(getOriginalCwd())
    const dir=workflowRunDirectory(projectDir,getSessionId(),input.resumeFromRunId)
    const metadata=JSON.parse(await readFile(join(dir,'metadata.json'),'utf8'))
    const scripts=workflowSessionScripts(projectDir,getSessionId())+sep
    if(metadata.sessionId!==getSessionId()||!metadata.scriptPath?.startsWith(scripts)||
      !metadata.scriptPath.endsWith(`-${input.resumeFromRunId}.js`))
      throw new Error('Workflow resume script identity is invalid')
    return readFile(metadata.scriptPath,'utf8')
  }
  const root=await realpath(getCwd())
  const candidate=input.name&&/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(input.name)?
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
      if(input.resumeFromRunId && !/^wf_[a-z0-9-]{6,}$/.test(input.resumeFromRunId))throw new Error('Invalid resumeFromRunId')
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
      // Freeze the actual approved script in the post-permission tool input.
      // A file may change between displaying the approval prompt and call().
      updatedInput:{script,args:input.args,resumeFromRunId:input.resumeFromRunId},
      decisionReason:{type:'safetyCheck' as const,reason:'Workflow can launch agents and run user-approved code',classifierApprovable:false}}
  },
  async call(input,context,canUseTool,parentMessage){
    const script=await resolveScript(input)
    const parsed=validateWorkflowScript(script)
    const result=await launchWorkflow({script,args:input.args,resumeFromRunId:input.resumeFromRunId,scriptPath:input.scriptPath},context,canUseTool,parentMessage)
    return {data:{status:'async_launched' as const,taskId:result.taskId,taskType:'local_workflow' as const,
      workflowName:result.workflowName,runId:result.runId,summary:parsed.meta.description,
      transcriptDir:result.transcriptDir,scriptPath:result.scriptPath}}
  },
  mapToolResultToToolResultBlockParam(data:Output,toolUseID:string){
    return {type:'tool_result' as const,tool_use_id:toolUseID,
      content:`Workflow launched in background. Task ID: ${data.taskId}\nSummary: ${data.summary}\nTranscript dir: ${data.transcriptDir}\nScript file: ${data.scriptPath}\n(Edit this file with Write/Edit and re-invoke Workflow with {scriptPath: ${JSON.stringify(data.scriptPath)}} to iterate without resending the script.)\nRun ID: ${data.runId}\nTo resume after editing the script: Workflow({scriptPath: ${JSON.stringify(data.scriptPath)}, resumeFromRunId: ${JSON.stringify(data.runId)}}) — completed agents return cached results (cached results may themselves be empty — inspect journal.jsonl before assuming there is something to recover).\n\nYou will be notified when it completes. Use /workflows to review or stop the run.`}
  },
} satisfies ToolDef<InputSchema,Output>)
