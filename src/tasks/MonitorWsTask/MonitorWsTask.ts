import WebSocket from 'ws'
import type { AgentId } from '../../types/ids.js'
import { lookup } from 'node:dns/promises'
import { createTaskStateBase, generateTaskId, type Task, type TaskStateBase, type SetAppState } from '../../Task.js'
import { registerCleanup } from '../../utils/cleanupRegistry.js'
import { enqueuePendingNotification } from '../../utils/messageQueueManager.js'
import { escapeXml } from '../../utils/xml.js'
import { registerTask, updateTaskState } from '../../utils/task/framework.js'
import { isPublicIp, validateMonitorWsUrl } from '../../utils/monitorProtocol.mjs'

export type MonitorWsTaskState = TaskStateBase & {
  type: 'monitor_ws'
  url: string
  eventCount: number
  agentId?: AgentId
}
type SocketHandle = { socket: WebSocket, timer?: NodeJS.Timeout, unregisterCleanup: () => void, agentId?: AgentId }
const sockets = new Map<string, SocketHandle>()
function notify(taskId: string, description: string, content: string, agentId?: AgentId) {
  // Official 2.1.310 WebSocket events carry a typed task identifier and
  // event payload. A free-form string would be mistaken for user text.
  enqueuePendingNotification({mode:'task-notification',priority:'next',agentId,
    value:`<task-notification>\n<task-id>${escapeXml(taskId)}</task-id>\n<summary>Monitor event: "${escapeXml(description)}"</summary>\n<event>${escapeXml(content)}</event>\n</task-notification>`})
}
function terminate(taskId: string, setAppState: SetAppState, status: 'completed' | 'failed' | 'killed') {
  const handle = sockets.get(taskId)
  if (!handle) return
  sockets.delete(taskId)
  if (handle.timer) clearTimeout(handle.timer)
  handle.unregisterCleanup()
  if (handle.socket.readyState === WebSocket.CONNECTING || handle.socket.readyState === WebSocket.OPEN) handle.socket.terminate()
  updateTaskState<MonitorWsTaskState>(taskId,setAppState,t=>({...t,status,endTime:Date.now(),notified:true}))
  // The caller emits the precise event once; avoid an extra generic
  // completion notice when a WebSocket close already supplied the reason.
}
export const MonitorWsTask: Task = {
  name:'MonitorWsTask',type:'monitor_ws',
  async kill(id,setAppState) {
    const h=sockets.get(id)
    if (!h) throw new Error(`Monitor ${id} is no longer running`)
    notify(id,'WebSocket','[WebSocket stopped]',h.agentId)
    terminate(id,setAppState,'killed')
  },
}
export async function startWebSocketMonitor(input: {
  url:string
  protocols?:string[]
  description:string
  timeoutMs:number
  persistent:boolean
},context:{setAppState:SetAppState,toolUseId?:string,agentId?:AgentId}):Promise<string> {
  const url=validateMonitorWsUrl(input.url)
  const host = url.hostname.replace(/^\[|\]$/g, '')
  const addresses=await lookup(host,{all:true})
  if(!addresses.length || addresses.some(a=>!isPublicIp(a.address))) throw new Error('Monitor WebSocket host resolves to a private, link-local, or metadata address')
  // Establish the DNS proof before configuring the socket lookup callback.
  const first=addresses[0]
  if (!first) throw new Error('Monitor WebSocket DNS lookup returned no addresses')
  const pinned=addresses.find(a=>a.family===4)??first
  const id=generateTaskId('monitor_ws')
  const task:MonitorWsTaskState={...createTaskStateBase(id,'monitor_ws',input.description,context.toolUseId),
    type:'monitor_ws',status:'running',url:input.url,eventCount:0,agentId:context.agentId}
  const socket=new WebSocket(input.url,input.protocols??[],{
    handshakeTimeout:30000,maxPayload:1048576,
    lookup:(_hostname,_options,cb)=>cb(null,pinned.address,pinned.family),
  })
  const unregisterCleanup=registerCleanup(async()=>{terminate(id,context.setAppState,'killed',input.description)})
  const h:SocketHandle={socket,unregisterCleanup,agentId:context.agentId}
  sockets.set(id,h)
  registerTask(task,context.setAppState)
  if(!input.persistent) {
    h.timer=setTimeout(()=>{
      if (!sockets.has(id)) return
      notify(id,input.description,'[WebSocket monitor deadline reached]',context.agentId)
      terminate(id,context.setAppState,'completed')
    },input.timeoutMs)
    h.timer.unref?.()
  }
  socket.on('message',(data,isBinary)=>{
    updateTaskState<MonitorWsTaskState>(id,context.setAppState,t=>({...t,eventCount:t.eventCount+1}))
    notify(id,input.description,isBinary?`[binary frame, ${data.length} bytes]`:data.toString('utf8').slice(0,1048576),context.agentId)
  })
  socket.on('error',error=>{
    if(!sockets.has(id)) return
    notify(id,input.description,`[WebSocket error: ${error.message}]`,context.agentId)
    terminate(id,context.setAppState,'failed')
  })
  socket.on('close',(code)=>{
    if(!sockets.has(id)) return
    notify(id,input.description,`[WebSocket closed: ${code}]`,context.agentId)
    terminate(id,context.setAppState,'completed')
  })
  return id
}

/** Task panel action; delegates to the same lifecycle as TaskStop. */
export async function killMonitorWs(taskId:string,setAppState:SetAppState):Promise<void>{
  await MonitorWsTask.kill(taskId,setAppState)
}
/** Release WebSocket monitors spawned by an agent after the agent exits. */
export function killMonitorWsTasksForAgent(
  agentId:AgentId,
  _getAppState:()=>unknown,
  setAppState:SetAppState,
):void{
  for(const [id,handle] of sockets){
    if(handle.agentId!==agentId)continue
    notify(id,'agent session ended','[WebSocket stopped]',agentId)
    terminate(id,setAppState,'killed')
  }
}
