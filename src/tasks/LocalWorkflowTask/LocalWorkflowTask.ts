import { randomUUID, createHash } from 'node:crypto'
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createTaskStateBase, generateTaskId, type Task, type TaskStateBase, type SetAppState } from '../../Task.js'
import type { ToolUseContext } from '../../Tool.js'
import { AgentTool } from '../../tools/AgentTool/AgentTool.js'
import { executeWorkflowScript, validateWorkflowScript } from '../../tools/WorkflowTool/workflowRuntime.mjs'
import { registerCleanup } from '../../utils/cleanupRegistry.js'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { enqueuePendingNotification } from '../../utils/messageQueueManager.js'
import { registerTask, updateTaskState } from '../../utils/task/framework.js'

export type LocalWorkflowTaskState = TaskStateBase & {
  type: 'local_workflow'
  workflowRunId: string
  workflowName: string
  summary: string
  runningAgents?:Array<{agentId:string,description:string}>
  phase?: string
  scriptPath?: string
  transcriptDir: string
}
type AgentControl={abort:AbortController,action:null|'skip'|'retry'}
type Job={abort:AbortController,unregister:()=>void,agents:Map<string,AgentControl>}
const active=new Map<string,Job>()
function folder(runId:string) {
  if(!/^wf_[a-f0-9]{12}$/.test(runId))throw new Error('Invalid workflow run ID')
  return join(getClaudeConfigHomeDir(),'workflow-runs',runId)
}
function tell(id:string,message:string) {
  enqueuePendingNotification({mode:'task-notification',priority:'next',value:`Workflow task ${id}: ${message}`})
}
function finish(id:string,setAppState:SetAppState,status:'completed'|'failed'|'killed',summary:string) {
  const job=active.get(id)
  if(!job)return
  active.delete(id)
  job.unregister()
  updateTaskState<LocalWorkflowTaskState>(id,setAppState,t=>({...t,status,endTime:Date.now(),notified:true}))
  tell(id,summary)
}
export const LocalWorkflowTask:Task={
  name:'LocalWorkflowTask',type:'local_workflow',
  async kill(id,setAppState){
    const job=active.get(id)
    if(!job)throw new Error(`Workflow task ${id} is no longer active`)
    job.abort.abort()
    for(const item of job.agents.values()) item.abort.abort()
    finish(id,setAppState,'killed','cancelled by TaskStop')
  },
}
/** User-facing task panel actions operate on real in-flight agents. */
export async function killWorkflowTask(taskId:string,setAppState:SetAppState):Promise<void>{
  await LocalWorkflowTask.kill(taskId,setAppState)
}
function changeAgent(taskId:string,agentId:string,action:'skip'|'retry'):void{
  const job=active.get(taskId)
  if(!job)throw new Error(`Workflow ${taskId} is no longer active`)
  const agent=job.agents.get(agentId)
  if(!agent)throw new Error(`Workflow agent ${agentId} is not running`)
  agent.action=action
  agent.abort.abort()
}
export function skipWorkflowAgent(taskId:string,agentId:string,_setAppState:SetAppState):void{
  changeAgent(taskId,agentId,'skip')
}
export function retryWorkflowAgent(taskId:string,agentId:string,_setAppState:SetAppState):void{
  changeAgent(taskId,agentId,'retry')
}
export async function launchWorkflow(
  input:{script:string,args?:Record<string,unknown>,resumeFromRunId?:string,scriptPath?:string},
  context:ToolUseContext,
  canUseTool:Parameters<typeof AgentTool.call>[2],
  parentMessage:Parameters<typeof AgentTool.call>[3],
):Promise<{taskId:string,runId:string,transcriptDir:string,workflowName:string,scriptPath:string}> {
  const parsed=validateWorkflowScript(input.script)
  const runId=input.resumeFromRunId??`wf_${randomUUID().replaceAll('-','').slice(0,12)}`
  const dir=folder(runId)
  await mkdir(dir,{recursive:true,mode:0o700})
  const scriptPath=join(dir,'script.mjs')
  const journal=join(dir,'journal.jsonl')
  const setAppState=context.setAppStateForTasks??context.setAppState
  const cached=new Map<string,unknown>()
  if(input.resumeFromRunId){
    const existing=JSON.parse(await readFile(join(dir,'metadata.json'),'utf8')) as {runId:string}
    if(existing.runId!==runId)throw new Error('Workflow resume ID does not match journal')
    const text=await readFile(journal,'utf8')
    for(const line of text.split('\n')){
      if(!line.trim())continue
      const record=JSON.parse(line) as {type:string,key?:string,result?:unknown}
      if(record.type==='agent_result'&&record.key)cached.set(record.key,record.result)
    }
  }else {
    await writeFile(scriptPath,input.script,{flag:'wx',mode:0o600})
    await writeFile(join(dir,'metadata.json'),JSON.stringify({runId,meta:parsed.meta,hash:parsed.hash}),{flag:'wx',mode:0o600})
  }
  const id=generateTaskId('local_workflow')
  const task:LocalWorkflowTaskState={
    ...createTaskStateBase(id,'local_workflow',parsed.meta.description,context.toolUseId),
    type:'local_workflow',status:'running',workflowRunId:runId,
    workflowName:parsed.meta.name,summary:parsed.meta.description,scriptPath,transcriptDir:dir,
  }
  const abort=new AbortController()
  const unregister=registerCleanup(async()=>{abort.abort();finish(id,setAppState,'killed','session ended')})
  const job:Job={abort,unregister,agents:new Map()}
  active.set(id,job)
  registerTask(task,setAppState)
  let writes=Promise.resolve()
  function journalEvent(event:Record<string,unknown>) {
    writes=writes.then(()=>appendFile(journal,`${JSON.stringify(event)}\n`,{mode:0o600}))
    return writes
  }
  void (async()=>{
    let count=0
    try{
      await journalEvent({type:'start',taskId:id,runId,scriptHash:parsed.hash})
      await executeWorkflowScript({
        script:input.script,args:input.args??{},signal:abort.signal,
        onPhase:phase=>{
          updateTaskState<LocalWorkflowTaskState>(id,setAppState,t=>({...t,phase}))
          void journalEvent({type:'phase',phase})
        },
        onLog:message=>{void journalEvent({type:'log',message})},
        agent:async(prompt:string,options:Record<string,unknown>)=>{
          if(abort.signal.aborted)throw new Error('Workflow cancelled')
          const index=count++
          const key=createHash('sha256').update(JSON.stringify({index,prompt,options})).digest('hex')
          if(cached.has(key))return cached.get(key)
          const agentId=`a${index+1}`
          let result:unknown
          for(;;){
          const control:AgentControl={abort:new AbortController(),action:null}
          job.agents.set(agentId,control)
          updateTaskState<LocalWorkflowTaskState>(id,setAppState,t=>({...t,
            runningAgents:[...(t.runningAgents??[]).filter(x=>x.agentId!==agentId),{agentId,description:prompt.slice(0,120)}]}))
          try{
          const response=await AgentTool.call({
            prompt,description:typeof options.description==='string'?options.description.slice(0,100):`Workflow ${parsed.meta.name} agent ${index+1}`,
            subagent_type:typeof options.subagent_type==='string'?options.subagent_type:'general-purpose',
            run_in_background:false,
          },{...context,abortController:control.abort},canUseTool,parentMessage)
          if(control.action==='skip'){
            await journalEvent({type:'agent_skipped',agentId,key})
            return ''
          }
          if(control.action==='retry'){
            await journalEvent({type:'agent_retry',agentId,key})
            continue
          }
          const data=response.data
          if(data.status!=='completed')throw new Error(`Workflow agent ${index+1} did not complete synchronously`)
          const value=data.content?.map(item=>item.type==='text'?item.text:'').join('\n')??''
          await journalEvent({type:'agent_result',key,result:value})
          return value
          }catch(error){
            if(control.action==='skip'){
              await journalEvent({type:'agent_skipped',agentId,key})
              return ''
            }
            if(control.action==='retry'){
              await journalEvent({type:'agent_retry',agentId,key})
              continue
            }
            throw error
          }finally{
            job.agents.delete(agentId)
            updateTaskState<LocalWorkflowTaskState>(id,setAppState,t=>({...t,
              runningAgents:(t.runningAgents??[]).filter(x=>x.agentId!==agentId)}))
          }
          }
        },
      })
      await writes
      await journalEvent({type:'complete'})
      finish(id,setAppState,'completed',`completed ${parsed.meta.name}`)
    }catch(error){
      await journalEvent({type:abort.signal.aborted?'cancelled':'failed',error:String(error)})
      finish(id,setAppState,abort.signal.aborted?'killed':'failed',`failed ${parsed.meta.name}: ${String(error)}`)
    }
  })()
  return {taskId:id,runId,transcriptDir:dir,workflowName:parsed.meta.name,scriptPath}
}
