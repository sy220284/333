import {test,expect} from 'bun:test'
import {clampMcpTaskPoll317,driveMcpTaskForeground317,mcpTasksEnabled317,
  readMcpTaskHandle317} from '../src/services/mcp/mcpTasks317.ts'

const base={resultType:'task' as const,taskId:'task-123',status:'working' as const,pollIntervalMs:10}
test('317 MCP task gate requires experiment and honors explicit disable',()=>{
 const gate=(name:string,value:boolean)=>{expect(name).toBe('tengu_glowing_lark');return value}
 expect(mcpTasksEnabled317({USER_TYPE:'ant'},gate)).toBe(true)
 expect(mcpTasksEnabled317({USER_TYPE:'ant',CLAUDE_CODE_DISABLE_MCP_TASKS:'1'},gate)).toBe(false)
 expect(mcpTasksEnabled317({USER_TYPE:'ant',CLAUDE_CODE_REMOTE:'1'},gate)).toBe(false)
 expect(mcpTasksEnabled317({},gate)).toBe(false)
})
test('317 MCP task handle strict validation and polling bounds',()=>{
 expect(readMcpTaskHandle317(base)?.taskId).toBe('task-123')
 expect(readMcpTaskHandle317({content:[]})).toBe(null)
 for(const malformed of [{resultType:'task',taskId:'',status:'working'},
   {resultType:'task',taskId:'a\nb',status:'working'},
   {resultType:'task',taskId:'ok',status:'made_up'}]){
   expect(()=>readMcpTaskHandle317(malformed)).toThrow('malformed task handle')
 }
 expect(clampMcpTaskPoll317(10)).toBe(250)
 expect(clampMcpTaskPoll317(10_000_000)).toBe(30_000)
 expect(clampMcpTaskPoll317()).toBe(2000)
})
test('317 SEP-2663 foreground task requests/get with Mcp-Name until complete',async()=>{
 const calls:string[]=[]
 const states=['working','completed']
 let seq=0
 const value=await driveMcpTaskForeground317({task:base,
   signal:new AbortController().signal,
   request:async(method,params,_signal,headers)=>{
     calls.push(method)
     expect(params.taskId).toBe('task-123')
     expect(headers['Mcp-Name']).toBe('task-123')
     const status=states[seq++]
     return status==='working'
       ? {taskId:'task-123',status,pollIntervalMs:1,statusMessage:'Preparing'}
       : {taskId:'task-123',status,result:{content:[{type:'text',text:'done'}]}}
   },
 })
 expect(value).toEqual({content:[{type:'text',text:'done'}]})
 expect(calls).toEqual(['tasks/get','tasks/get'])
})
test('317 explicit server failure cannot be turned into success',async()=>{
 await expect(driveMcpTaskForeground317({
   task:base,signal:new AbortController().signal,
   request:async()=>({taskId:'task-123',status:'failed',error:{message:'remote rejected'}}),
 })).rejects.toThrow('remote rejected')
})
test('317 cancellation propagates and notifies MCP server',async()=>{
 const controller=new AbortController()
 const calls:string[]=[]
 const pending=driveMcpTaskForeground317({
   task:base,signal:controller.signal,
   request:async method=>{
     calls.push(method)
     return {taskId:'task-123',status:'working'}
   },
 })
 setTimeout(()=>controller.abort(new Error('user cancel')),15)
 await expect(pending).rejects.toThrow('user cancel')
 expect(calls).toContain('tasks/cancel')
})
test('317 unsupported MCP task user input cancels remote task',async()=>{
 const calls:string[]=[]
 await expect(driveMcpTaskForeground317({
   task:base,signal:new AbortController().signal,
   request:async(method)=>{
     calls.push(method)
     return method==='tasks/get'
       ? {taskId:'task-123',status:'input_required',
          inputRequests:{q1:{method:'elicitation/create'}}}
       : {taskId:'task-123',status:'cancelled'}
   },
 })).rejects.toThrow('needs user input')
 expect(calls).toEqual(['tasks/get','tasks/cancel'])
})
