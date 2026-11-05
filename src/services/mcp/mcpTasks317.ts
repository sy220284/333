/**
 * MCP SEP-2663 task driver, ported from Claude Code 2.1.317
 * chunk-fsyfgpr7.js and chunk-zdxm7vb3.js.
 * This owns task return validation, polling, cancellation and capability gate.
 * The caller owns transport, permission and elicitation context.
 */
import {getFeatureValue_CACHED_MAY_BE_STALE} from '../analytics/growthbook.js'

export type McpTaskHandle317={
  resultType:'task'
  taskId:string
  status:'working'|'input_required'|'completed'|'failed'|'cancelled'
  pollIntervalMs?:number
  ttlMs?:number
}
type TaskPoll317 = {
  taskId:string
  status:McpTaskHandle317['status']
  pollIntervalMs?:number
  statusMessage?:string
  result?:unknown
  error?:{message?:string;code?:number;data?:unknown}
  inputRequests?:Record<string,unknown>
}
export type McpTaskRequest317=(method:'tasks/get'|'tasks/cancel',
  params:{taskId:string}, signal:AbortSignal, headers:Record<string,string>)=>Promise<unknown>

const ID=/^[^\x00-\x1f\x7f]{1,255}$/
const STATES=new Set(['working','input_required','completed','failed','cancelled'])
const TASK_POLL_DEFAULT_MS=2_000
export function mcpTasksEnabled317(
  env:NodeJS.ProcessEnv=process.env,
  gate:(name:string,fallback:boolean)=>boolean=getFeatureValue_CACHED_MAY_BE_STALE,
):boolean{
  if(env.CLAUDE_CODE_DISABLE_MCP_TASKS)return false
  // Internal builds default on, external clients follow GrowthBook; remote
  // subprocesses never own MCP background task state.
  const fallback=env.USER_TYPE==='ant' && !env.CLAUDE_CODE_REMOTE
  return gate('tengu_glowing_lark',fallback)
}
export function mcpTaskBackgroundEnabled317(env:NodeJS.ProcessEnv=process.env):boolean{
  return mcpTasksEnabled317(env) && !env.CLAUDE_CODE_DISABLE_MCP_TASK_BACKGROUND
}
function record(value:unknown):value is Record<string,unknown>{
  return value!==null && typeof value==='object' && !Array.isArray(value)
}
function validId(value:unknown):value is string{
  return typeof value==='string' && ID.test(value)
}
export function readMcpTaskHandle317(result:unknown):McpTaskHandle317|null{
  if(!record(result)||result.resultType!=='task')return null
  if(!validId(result.taskId)||!STATES.has(String(result.status))) {
    throw new Error('MCP server returned malformed task handle; it may still be running')
  }
  if(result.pollIntervalMs!==undefined&&
    (typeof result.pollIntervalMs!=='number'||!Number.isFinite(result.pollIntervalMs))){
    throw new Error('MCP server returned invalid task polling interval')
  }
  return result as McpTaskHandle317
}
export function clampMcpTaskPoll317(value?:number):number{
  return Math.min(30_000,Math.max(250,value??TASK_POLL_DEFAULT_MS))
}
function parsePoll(value:unknown,taskId:string):TaskPoll317{
  if(!record(value)||!validId(value.taskId)||value.taskId!==taskId||
    !STATES.has(String(value.status)))throw new Error('Malformed tasks/get response for task '+taskId)
  if(value.pollIntervalMs!==undefined&&
    (typeof value.pollIntervalMs!=='number'||!Number.isFinite(value.pollIntervalMs)))
    throw new Error('Malformed tasks/get polling interval for '+taskId)
  return value as TaskPoll317
}
async function pause(ms:number,signal:AbortSignal):Promise<void>{
  if(signal.aborted)throw signal.reason??new DOMException('Aborted','AbortError')
  await new Promise<void>((resolve,reject)=>{
    const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve()},ms)
    const abort=()=>{clearTimeout(timer);reject(signal.reason??new DOMException('Aborted','AbortError'))}
    signal.addEventListener('abort',abort,{once:true})
  })
}
async function cancelTask(taskId:string,request:McpTaskRequest317,
  onDebug?:(message:string)=>void):Promise<void>{
  try{
    const timeout=AbortSignal.timeout(5_000)
    await request('tasks/cancel',{taskId},timeout,{'Mcp-Name':taskId})
  }catch(error){onDebug?.('task '+taskId+': cancel failed: '+(error instanceof Error?error.message:String(error)))}
}
export async function driveMcpTaskForeground317({
  task,request,signal,onStatus,onDebug,resolveInputRequest,
}:{
  task:McpTaskHandle317
  request:McpTaskRequest317
  signal:AbortSignal
  onStatus?:(status:TaskPoll317)=>void
  onDebug?:(message:string)=>void
  resolveInputRequest?:(key:string,input:unknown)=>Promise<unknown>
}):Promise<unknown>{
  let interval=clampMcpTaskPoll317(task.pollIntervalMs)
  let fails=0
  let first=true
  const answers=new Map<string,unknown>()
  try{
    for(;;){
      if(!first)await pause(interval,signal)
      first=false
      if(signal.aborted)throw signal.reason??new DOMException('Aborted','AbortError')
      let next:TaskPoll317
      try{
        next=parsePoll(await request('tasks/get',{taskId:task.taskId},signal,{'Mcp-Name':task.taskId}),task.taskId)
        fails=0
      }catch(error){
        if(signal.aborted)throw error
        if(++fails>=5)throw new Error('Lost contact with MCP task '+task.taskId+' after 5 failed polls',{cause:error})
        onDebug?.('task '+task.taskId+': poll failure '+fails+'/5')
        continue
      }
      onStatus?.(next)
      interval=clampMcpTaskPoll317(next.pollIntervalMs??interval)
      switch(next.status){
      case 'completed':
        if(next.result===undefined)throw new Error('MCP task '+task.taskId+' completed without result')
        return next.result
      case 'failed':throw new Error('MCP task '+task.taskId+' failed: '+(next.error?.message??next.statusMessage??'Task failed'))
      case 'cancelled':throw new Error('MCP task '+task.taskId+' cancelled: '+(next.statusMessage??'Cancelled by server'))
      case 'working':continue
      case 'input_required':{
        const inputs=next.inputRequests
        if(!inputs||Object.keys(inputs).length===0)continue
        if(!resolveInputRequest){
          await cancelTask(task.taskId,request,onDebug)
          throw new Error('MCP task '+task.taskId+' needs user input; no interactive handler is available')
        }
        const pending=Object.entries(inputs).filter(([key])=>!answers.has(key))
        if(pending.length===0){
          await cancelTask(task.taskId,request,onDebug)
          throw new Error('MCP task '+task.taskId+' did not accept the previous input answer')
        }
        if(answers.size+pending.length>16){
          await cancelTask(task.taskId,request,onDebug)
          throw new Error('MCP task '+task.taskId+' exceeded 16 input questions')
        }
        // SEP-2663 input requests carry arbitrary methods. The frontend may
        // only supply an answer using the trusted elicitation handler.
        for(const [key,input] of pending){
          const answer=await resolveInputRequest(key,input)
          if(answer===undefined){
            await cancelTask(task.taskId,request,onDebug)
            throw new Error('MCP task '+task.taskId+' requested unsupported input')
          }
          answers.set(key,answer)
        }
        continue
      }
      }
    }
  }catch(error){
    if(signal.aborted)await cancelTask(task.taskId,request,onDebug)
    throw error
  }
}
