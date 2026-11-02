import { z } from 'zod/v4'
import { lookup } from 'node:dns/promises'
import { buildTool, type ToolDef } from '../../Tool.js'
import { BashTool } from '../BashTool/BashTool.js'
import { shouldUseSandbox } from '../BashTool/shouldUseSandbox.js'
import { exec } from '../../utils/Shell.js'
import { spawnShellTask } from '../../tasks/LocalShellTask/LocalShellTask.js'
import { stopTask } from '../../tasks/stopTask.js'
import { startWebSocketMonitor } from '../../tasks/MonitorMcpTask/MonitorMcpTask.js'
import { enqueuePendingNotification } from '../../utils/messageQueueManager.js'
import { isPublicIp, validateMonitorArguments, validateMonitorWsUrl } from '../../utils/monitorProtocol.mjs'
import { lazySchema } from '../../utils/lazySchema.js'

const inputSchema = lazySchema(() => z.strictObject({
  description:z.string().min(1),
  command:z.string().optional().describe('Shell command or script. Each stdout line is an event; exit ends the watch.'),
  ws:z.object({url:z.string(),protocols:z.array(z.string()).optional()}).optional()
    .describe('WebSocket text frames are events; socket close ends the watch.'),
  timeout_ms:z.number().int().min(1000).max(3600000).optional().default(300000),
  persistent:z.boolean().optional().default(false),
}).refine(v=>(v.command!==undefined)!==(v.ws!==undefined),'exactly one of command or ws'))
type InputSchema=ReturnType<typeof inputSchema>
const outputSchema=lazySchema(()=>z.object({
  taskId:z.string(),timeoutMs:z.number(),persistent:z.boolean().optional(),
}))
type OutputSchema=ReturnType<typeof outputSchema>
type Output=z.infer<OutputSchema>
async function verifyWsHost(raw:string){
  const url=validateMonitorWsUrl(raw)
  const addresses=await lookup(url.hostname,{all:true})
  if(!addresses.length||addresses.some(a=>!isPublicIp(a.address)))
    throw new Error('WebSocket host resolves to a private, link-local, or metadata address')
}
export const MonitorTool=buildTool({
  name:'Monitor',
  searchHint:'watch, monitor, or keep an eye on a process/log/command or WebSocket — stream each stdout line as a live notification',
  maxResultSizeChars:10000,shouldDefer:true,enablesCodeExecution:true,
  userFacingName(){return 'Monitor'},
  async description(){return 'Watch a command or WebSocket in the background with notifications; use TaskStop to stop it.'},
  async prompt(){return 'Specify command or ws, not both. Each stdout line or WebSocket frame generates a notification. Default timeout 300000ms; persistent runs until TaskStop or session end.'},
  get inputSchema():InputSchema{return inputSchema()},
  get outputSchema():OutputSchema{return outputSchema()},
  isEnabled(){return true},
  isReadOnly(){return false},
  isConcurrencySafe(){return true},
  toAutoClassifierInput(input){return input.command??`websocket ${input.ws?.url??''}`},
  renderToolUseMessage(input){return input.description},
  async validateInput(input){
    try {validateMonitorArguments(input);if(input.ws)await verifyWsHost(input.ws.url)}
    catch(e){return {result:false as const,message:e instanceof Error?e.message:String(e),errorCode:9}}
    return {result:true as const}
  },
  async checkPermissions(input,context){
    if(input.ws){
      try {await verifyWsHost(input.ws.url)}
      catch(e){return {behavior:'deny' as const,message:e instanceof Error?e.message:String(e),
        decisionReason:{type:'other' as const,reason:'Monitor WebSocket network safety policy'}}}
      return {behavior:'ask' as const,
        message:`Monitor will open a WebSocket to ${input.ws.url}`,
        decisionReason:{type:'safetyCheck' as const,reason:'WebSocket outbound connection requires explicit consent',classifierApprovable:false}}
    }
    return BashTool.checkPermissions({command:input.command!,description:input.description,run_in_background:true},context)
  },
  async call(input,context){
    const timeoutMs=input.persistent?0:input.timeout_ms
    if(input.ws){
      const id=await startWebSocketMonitor({url:input.ws.url,protocols:input.ws.protocols,
        description:input.description,timeoutMs:input.timeout_ms,persistent:input.persistent},
        {setAppState:context.setAppStateForTasks??context.setAppState,toolUseId:context.toolUseId})
      return {data:{taskId:id,timeoutMs,persistent:input.persistent}}
    }
    const {abortController,getAppState}=context
    const setAppState=context.setAppStateForTasks??context.setAppState
    let taskId:string|undefined
    let lastOutput='',buffered=''
    const shell=await exec(input.command!,abortController.signal,'bash',{
      timeout:input.persistent?2147483647:input.timeout_ms,
      shouldUseSandbox:shouldUseSandbox({command:input.command!,description:input.description}),
      onProgress(_last,all){
        const full=typeof all==='string'?all:''
        const delta=full.startsWith(lastOutput)?full.slice(lastOutput.length):full
        lastOutput=full;buffered+=delta
        let next
        while((next=buffered.indexOf('\n'))>=0){
          const line=buffered.slice(0,next);buffered=buffered.slice(next+1)
          if(!line.trim()||!taskId)continue
          enqueuePendingNotification({mode:'task-notification',priority:'next',
            value:`Monitor "${input.description}" [task ${taskId}]: ${line}`})
        }
      },
    })
    const handle=await spawnShellTask({command:input.command!,description:input.description,
      shellCommand:shell,toolUseId:context.toolUseId,agentId:context.agentId,kind:'monitor'},
      {abortController,getAppState,setAppState})
    taskId=handle.taskId
    if(!input.persistent){
      const timer=setTimeout(()=>{
        if(getAppState().tasks[handle.taskId]?.status!=='running')return
        void stopTask(handle.taskId,{getAppState,setAppState}).catch(e=>
          enqueuePendingNotification({mode:'task-notification',priority:'next',
            value:`Monitor "${input.description}" could not stop at deadline: ${String(e)}`}))
      },input.timeout_ms)
      timer.unref?.()
      void shell.result.finally(()=>clearTimeout(timer))
    }
    return {data:{taskId:handle.taskId,timeoutMs,persistent:input.persistent}}
  },
  mapToolResultToToolResultBlockParam(data:Output,toolUseID:string){
    const duration=data.persistent?'persistent — runs until TaskStop or session end':
      `expires in ${data.timeoutMs}ms unless the source ends first`
    return {type:'tool_result' as const,tool_use_id:toolUseID,
      content:`Monitor started (task ${data.taskId}, ${duration}). You will be notified on each event. Keep working — do not poll or sleep.`}
  },
} satisfies ToolDef<InputSchema,Output>)
