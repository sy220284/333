import WebSocket from 'ws'
import { lookup } from 'node:dns/promises'
import { createTaskStateBase, generateTaskId, type Task, type TaskStateBase, type SetAppState } from '../../Task.js'
import { registerCleanup } from '../../utils/cleanupRegistry.js'
import { enqueuePendingNotification } from '../../utils/messageQueueManager.js'
import { registerTask, updateTaskState } from '../../utils/task/framework.js'
import { isPublicIp, validateMonitorWsUrl } from '../../utils/monitorProtocol.mjs'

export type MonitorMcpTaskState = TaskStateBase & {
  type: 'monitor_mcp'
  url: string
  eventCount: number
}
type SocketHandle = { socket: WebSocket, timer?: NodeJS.Timeout, unregisterCleanup: () => void }
const sockets = new Map<string, SocketHandle>()
function notify(taskId: string, description: string, content: string) {
  enqueuePendingNotification({mode:'task-notification',priority:'next',
    value:`Monitor "${description}" [task ${taskId}]: ${content}`})
}
function terminate(taskId: string, setAppState: SetAppState, status: 'completed' | 'failed' | 'killed', description: string) {
  const handle = sockets.get(taskId)
  if (!handle) return
  sockets.delete(taskId)
  if (handle.timer) clearTimeout(handle.timer)
  handle.unregisterCleanup()
  if (handle.socket.readyState === WebSocket.CONNECTING || handle.socket.readyState === WebSocket.OPEN) handle.socket.terminate()
  updateTaskState<MonitorMcpTaskState>(taskId,setAppState,t=>({...t,status,endTime:Date.now(),notified:true}))
  notify(taskId,description,`stream ${status}`)
}
export const MonitorMcpTask: Task = {
  name:'MonitorMcpTask',type:'monitor_mcp',
  async kill(id,setAppState) {
    const h=sockets.get(id)
    if (!h) throw new Error(`Monitor ${id} is no longer running`)
    terminate(id,setAppState,'killed','WebSocket')
  },
}
export async function startWebSocketMonitor(input: {
  url:string
  protocols?:string[]
  description:string
  timeoutMs:number
  persistent:boolean
},context:{setAppState:SetAppState,toolUseId?:string}):Promise<string> {
  const url=validateMonitorWsUrl(input.url)
  const host = url.hostname.replace(/^\[|\]$/g, '')
  const addresses=await lookup(host,{all:true})
  if(!addresses.length || addresses.some(a=>!isPublicIp(a.address))) throw new Error('Monitor WebSocket host resolves to a private, link-local, or metadata address')
  const pinned=addresses.find(a=>a.family===4)??addresses[0]!
  const id=generateTaskId('monitor_mcp')
  const task:MonitorMcpTaskState={...createTaskStateBase(id,'monitor_mcp',input.description,context.toolUseId),
    type:'monitor_mcp',status:'running',url:input.url,eventCount:0}
  const socket=new WebSocket(input.url,input.protocols??[],{
    handshakeTimeout:30000,maxPayload:1048576,
    lookup:(_hostname,_options,cb)=>cb(null,pinned.address,pinned.family),
  })
  const unregisterCleanup=registerCleanup(async()=>{terminate(id,context.setAppState,'killed',input.description)})
  const h:SocketHandle={socket,unregisterCleanup}
  sockets.set(id,h)
  registerTask(task,context.setAppState)
  if(!input.persistent) {
    h.timer=setTimeout(()=>terminate(id,context.setAppState,'completed',input.description),input.timeoutMs)
    h.timer.unref?.()
  }
  socket.on('message',(data,isBinary)=>{
    updateTaskState<MonitorMcpTaskState>(id,context.setAppState,t=>({...t,eventCount:t.eventCount+1}))
    notify(id,input.description,isBinary?`[binary frame, ${data.length} bytes]`:data.toString('utf8').slice(0,1048576))
  })
  socket.on('error',error=>{notify(id,input.description,`socket error: ${error.message}`);terminate(id,context.setAppState,'failed',input.description)})
  socket.on('close',()=>terminate(id,context.setAppState,'completed',input.description))
  return id
}
