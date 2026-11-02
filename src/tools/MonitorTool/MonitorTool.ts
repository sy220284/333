import { z } from 'zod/v4'
import { lookup } from 'node:dns/promises'
import { buildTool, type ToolDef } from '../../Tool.js'
import { BashTool } from '../BashTool/BashTool.js'
import { shouldUseSandbox } from '../BashTool/shouldUseSandbox.js'
import { exec } from '../../utils/Shell.js'
import { spawnShellTask } from '../../tasks/LocalShellTask/LocalShellTask.js'
import { stopTask } from '../../tasks/stopTask.js'
import { startWebSocketMonitor } from '../../tasks/MonitorWsTask/MonitorWsTask.js'
import { enqueuePendingNotification } from '../../utils/messageQueueManager.js'
import { isPublicIp, validateMonitorArguments, validateMonitorWsUrl } from '../../utils/monitorProtocol.mjs'
import { lazySchema } from '../../utils/lazySchema.js'

const inputSchema = lazySchema(() => z.strictObject({
  description:z.string().describe('Short human-readable description of what you are monitoring (shown in notifications).'),
  timeout_ms:z.number().min(1000).max(3600000).default(300000)
    .describe('Kill the monitor after this deadline. Default 300000ms. Deadlines above 600000ms are capped to 600000ms. You are notified at expiry and can re-arm.'),
  command:z.string().optional().describe('Shell command or script. Each stdout line is an event; exit ends the watch.'),
  ws:z.object({
    url:z.string(),
    protocols:z.array(z.string().regex(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/)).optional(),
  }).optional().describe('WebSocket to open. Each text frame is an event; binary frames are reported as a placeholder line. Socket close ends the watch. Cannot be combined with command.'),
}).refine(v=>(v.command!==undefined)!==(v.ws!==undefined),'exactly one of command or ws'))
type InputSchema=ReturnType<typeof inputSchema>
const outputSchema=lazySchema(()=>z.object({
  taskId:z.string(),timeoutMs:z.number(),persistent:z.boolean().optional(),
}))
type OutputSchema=ReturnType<typeof outputSchema>
type Output=z.infer<OutputSchema>
async function verifyWsHost(raw:string){
  const url=validateMonitorWsUrl(raw)
  const host = url.hostname.replace(/^\[|\]$/g, '')
  const addresses=await lookup(host,{all:true})
  if(!addresses.length||addresses.some(a=>!isPublicIp(a.address)))
    throw new Error('WebSocket host resolves to a private, link-local, or metadata address')
}
export const MonitorTool=buildTool({
  name:'Monitor',
  searchHint:'watch, monitor, or keep an eye on a process/log/command or WebSocket — stream each stdout line as a live notification',
  maxResultSizeChars:10000,shouldDefer:true,enablesCodeExecution:true,
  userFacingName(){return 'Monitor'},
  async description(){return 'Watch a command or WebSocket in the background with notifications; use TaskStop to stop it.'},
  async prompt(){return 'Specify command or ws, not both. Each stdout line or WebSocket frame generates a notification. Default timeout 300000ms; deadlines above 600000ms are capped to 600000ms.'},
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
    // The 2.1.310 public schema accepts up to 3,600,000ms but caps
    // actual monitor deadlines at 600,000ms.
    const timeoutMs=Math.min(input.timeout_ms,600000)
    if(input.ws){
      const id=await startWebSocketMonitor({url:input.ws.url,protocols:input.ws.protocols,
        description:input.description,timeoutMs,persistent:false},
        {setAppState:context.setAppStateForTasks??context.setAppState,toolUseId:context.toolUseId,agentId:context.agentId})
      return {data:{taskId:id,timeoutMs,persistent:false}}
    }
    const {abortController,getAppState}=context
    const setAppState=context.setAppStateForTasks??context.setAppState
    let taskId:string|undefined
    let lastOutput='',buffered=''
    const pendingLines:string[]=[]
    const emitLine=(line:string)=>{
      if(!line.trim())return
      if(!taskId){pendingLines.push(line);return}
      enqueuePendingNotification({mode:'task-notification',priority:'next',
        value:`Monitor "${input.description}" [task ${taskId}]: ${line}`})
    }
    const shell=await exec(input.command!,abortController.signal,'bash',{
      timeout:timeoutMs,
      shouldUseSandbox:shouldUseSandbox({command:input.command!}),
      onProgress(_last,all){
        const full=typeof all==='string'?all:''
        const delta=full.startsWith(lastOutput)?full.slice(lastOutput.length):full
        lastOutput=full;buffered+=delta
        let next
        while((next=buffered.indexOf('\n'))>=0){
          const line=buffered.slice(0,next);buffered=buffered.slice(next+1)
          emitLine(line)
        }
      },
    })
    const handle=await spawnShellTask({command:input.command!,description:input.description,
      shellCommand:shell,toolUseId:context.toolUseId,agentId:context.agentId,kind:'monitor'},
      {abortController,getAppState,setAppState})
    taskId=handle.taskId
    // Very short commands can finish before spawnShellTask returns its task ID.
    // Publish their buffered lines after registration instead of dropping them.
    for(const line of pendingLines)emitLine(line)
    pendingLines.length=0
    void shell.result.then(()=>{if(buffered){emitLine(buffered);buffered=''}},
      ()=>{if(buffered){emitLine(buffered);buffered=''}})
    {
      const timer=setTimeout(()=>{
        if(getAppState().tasks[handle.taskId]?.status!=='running')return
        void stopTask(handle.taskId,{getAppState,setAppState}).catch(e=>
          enqueuePendingNotification({mode:'task-notification',priority:'next',
            value:`Monitor "${input.description}" could not stop at deadline: ${String(e)}`}))
      },timeoutMs)
      timer.unref?.()
      void shell.result.then(()=>clearTimeout(timer),()=>clearTimeout(timer))
    }
    return {data:{taskId:handle.taskId,timeoutMs,persistent:false}}
  },
  mapToolResultToToolResultBlockParam(data:Output,toolUseID:string){
    const duration=data.persistent?'persistent — runs until TaskStop or session end':
      `expires in ${data.timeoutMs}ms unless the source ends first`
    return {type:'tool_result' as const,tool_use_id:toolUseID,
      content:`Monitor started (task ${data.taskId}, ${duration}; you get one notice at expiry — re-arm if you still need the watch). You will be notified on each event. Keep working — do not poll or sleep. Events may arrive while you are waiting for the user — an event is not their reply.`}
  },
} satisfies ToolDef<InputSchema,Output>)
