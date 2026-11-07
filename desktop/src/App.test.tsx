import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppEvent } from './api'

const SID='9b0c188a-66fd-4b30-82e0-f52f2f8dfc35'
let listener:(event:AppEvent)=>void=()=>{}
let showHistoricalJob=false
let failMcpRefresh=false
let activeAgentMode:'master'|'super'='master'
let mockTasks:Array<{taskId:string;description:string;status:string}>=[]
const call=vi.fn(async(method:string,args:Record<string,unknown>={})=>{
  switch(method){
    case 'app.info': return {workspace:'/projects/example',platform:'linux',version:'0.1.0'}
    case 'hello':return {protocolVersion:1,capabilities:['sessions','missions','agents']}
    case 'models.list':return {models:[{value:'minimax/M3',displayName:'MiniMax M3'}]}
    case 'sessions.list':return []
    case 'agents.overview':return {mode:activeAgentMode,teams:[],missions:[],activeSessions:0,activeTasks:0}
    case 'agents.setMode': activeAgentMode=args.mode==='super'?'super':'master'; return {mode:activeAgentMode}
    case 'missions.list':return showHistoricalJob
      ? {missions:[{missionId:'mission-fixture',objective:'历史任务',status:'active'}],selectedMissionId:'mission-fixture'}
      : {missions:[],selectedMissionId:null}
    case 'missions.jobs.list':return showHistoricalJob
      ? [{id:'job-1',title:'审核旧执行',instruction:'分析来源',status:'completed',attempt:1,sessionId:SID}]
      : []
    case 'sessions.history':return [{
      uuid:'history-message-1',type:'assistant',
      message:{role:'assistant',content:[{type:'text',text:'历史执行内容'}]},
      timestamp:'2026-11-06T12:00:00Z'
    }]
    case 'sessions.ensureOpen':return {sessionId:SID,resumed:true,tasks:[]}
    case 'permissions.list':return []
    case 'host.list':return []
    case 'credentials.list':return {providers:['openai']}
    case 'mcp.list':
      if(failMcpRefresh)throw new Error('MCP 服务离线')
      return {servers:[{name:'project-mcp',scope:'project',type:'http',url:'https://example.org/mcp',disabled:false}],errors:[]}
    case 'sessions.open':return {sessionId:SID,tasks:mockTasks}
    case 'sessions.send':return {sessionId:SID,turnId:'11afef34-e0a6-4c38-a743-1c451993fdb8'}
    case 'permissions.decide':return {permissionId:args.permissionId,accepted:true}
    case 'credentials.set':return {saved:true}
    case 'mcp.toggle':return {name:args.name,enabled:args.enabled}
    case 'external.open':return {opened:true}
    case 'host.respond':return {requestId:args.requestId,accepted:true}
    case 'tasks.list':return mockTasks
    default:return {}
  }
})
Object.defineProperty(window,'yaoyao',{value:{
  call,
  subscribe(handler:(event:AppEvent)=>void){listener=handler;return ()=>{listener=()=>{}}}
},configurable:true})
HTMLElement.prototype.scrollIntoView=vi.fn()
const {App}=await import('./App')

beforeEach(()=>{call.mockClear();listener=()=>{};showHistoricalJob=false;failMcpRefresh=false;activeAgentMode='master';mockTasks=[]})
afterEach(()=>cleanup())

describe('摇摇车真实桌面页面交互',()=>{
  it('历史工作项仅查看不自动恢复，发送时才恢复原 SDK 会话',async()=>{
    showHistoricalJob=true
    const user=userEvent.setup()
    render(<App/>)
    await screen.findByText('本地后台已连接')
    await user.click(screen.getByRole('button',{name:'长期任务'}))
    await screen.findByText('审核旧执行')
    await user.click(screen.getByRole('button',{name:'查看会话'}))
    await screen.findByText('历史执行内容')
    expect(screen.getByText(/发送新消息时将恢复原会话/)).toBeInTheDocument()
    expect(call).not.toHaveBeenCalledWith('sessions.ensureOpen',{sessionId:SID})
    await user.type(screen.getByRole('textbox',{name:'输入任务'}),'继续原任务')
    await user.click(screen.getByRole('button',{name:'发送'}))
    await waitFor(()=>expect(call).toHaveBeenCalledWith('sessions.ensureOpen',{sessionId:SID}))
    await waitFor(()=>expect(call).toHaveBeenCalledWith('sessions.send',{sessionId:SID,message:'继续原任务'}))
    expect(screen.queryByText(/发送新消息时将恢复原会话/)).not.toBeInTheDocument()
  })

  it('MCP URL请求提供HTTPS浏览器访问、完成确认与明确拒绝',async()=>{
    const user=userEvent.setup()
    render(<App/>)
    await screen.findByText('本地后台已连接')
    await act(async()=>listener({event:'host.request',sessionId:SID,request:{
      id:'mcp-url-1',request:{subtype:'elicitation',mode:'url',
        url:'https://mcp.example.org/authorize',mcp_server_name:'测试服务器',message:'完成授权'}
    }}))
    const dialog=await screen.findByRole('dialog',{name:'主机交互请求'})
    expect(within(dialog).getByText(/mcp.example.org\/authorize/)).toBeInTheDocument()
    expect(within(dialog).queryByRole('button',{name:'提交输入'})).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button',{name:'在浏览器中打开'}))
    await waitFor(()=>expect(call).toHaveBeenCalledWith('external.open',{url:'https://mcp.example.org/authorize'}))
    expect(call).not.toHaveBeenCalledWith('host.respond',expect.anything())
    await user.click(within(dialog).getByRole('button',{name:'已完成，继续'}))
    await waitFor(()=>expect(call).toHaveBeenCalledWith('host.respond',{
      sessionId:SID,requestId:'mcp-url-1',response:{action:'accept'}
    }))
    await act(async()=>listener({event:'host.request',sessionId:SID,request:{
      id:'mcp-url-2',request:{subtype:'elicitation',mode:'url',
        url:'javascript:alert(1)',mcp_server_name:'测试服务器',message:'可疑链接'}
    }}))
    const suspicious=await screen.findByRole('dialog',{name:'主机交互请求'})
    expect(within(suspicious).getByRole('button',{name:'在浏览器中打开'})).toBeDisabled()
    await user.click(within(suspicious).getByRole('button',{name:'拒绝访问'}))
    await waitFor(()=>expect(call).toHaveBeenCalledWith('host.respond',{
      sessionId:SID,requestId:'mcp-url-2',response:{action:'decline'}
    }))
  })

  it('刷新某项失败会显示具体模块和原因',async()=>{
    failMcpRefresh=true
    render(<App/>)
    await screen.findByText('本地后台已连接')
    await screen.findByText(/刷新部分失败：MCP服务：MCP 服务离线/)
  })

  it('加载真实工作区、模型和九个导航入口',async()=>{
    render(<App/>)
    await screen.findByText('本地后台已连接')
    const navigation=screen.getByRole('navigation',{name:'主要导航'})
    expect(within(navigation).getByRole('button',{name:'工作台概览'})).toBeInTheDocument()
    expect(within(navigation).getByRole('button',{name:'智能体团队'})).toBeInTheDocument()
    expect(within(navigation).getByRole('button',{name:'长期任务'})).toBeInTheDocument()
    expect(within(navigation).getByRole('button',{name:'项目文件'})).toBeInTheDocument()
    expect(call).toHaveBeenCalledWith('models.list')
    expect(call).toHaveBeenCalledWith('mcp.list')
  })

  it('新建会话发送消息后收到工具审批并明确批准',async()=>{
    const user=userEvent.setup()
    render(<App/>)
    await screen.findByText('本地后台已连接')
    await user.click(screen.getByRole('button',{name:'AI 对话'}))
    await user.type(screen.getByRole('textbox',{name:'输入任务'}),'分析这个项目')
    await user.click(screen.getByRole('button',{name:'发送'}))
    await waitFor(()=>expect(call).toHaveBeenCalledWith('sessions.send',{sessionId:SID,message:'分析这个项目'}))
    await act(async()=>listener({event:'permission.request',sessionId:SID,permission:{id:'approval-1',toolName:'Bash',input:{command:'bun test'}}}))
    const dialog=screen.getByRole('dialog',{name:'工具权限审批'})
    expect(within(dialog).getByText(/Bash/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button',{name:'允许本次操作'}))
    await waitFor(()=>expect(call).toHaveBeenCalledWith('permissions.decide',{
      sessionId:SID,permissionId:'approval-1',decision:{behavior:'allow'}
    }))
  })

  it('两个后台智能体同时请求权限时逐项回传各自SDK会话',async()=>{
    const user=userEvent.setup()
    const SECOND='e9c46d7b-2766-49c8-9f2d-142c90a45d5a'
    render(<App/>)
    await screen.findByText('本地后台已连接')
    await act(async()=>{
      listener({event:'permission.request',sessionId:SID,permission:{id:'approval-main',toolName:'Bash',input:{command:'git status'}}})
      listener({event:'permission.request',sessionId:SECOND,permission:{id:'approval-worker',toolName:'FileEdit',input:{file_path:'a.ts'}}})
    })
    const dialog=screen.getByRole('dialog',{name:'工具权限审批'})
    expect(within(dialog).getByText(/另有 1 项待审操作/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button',{name:'允许本次操作'}))
    await waitFor(()=>expect(call).toHaveBeenCalledWith('permissions.decide',{
      sessionId:SID,permissionId:'approval-main',decision:{behavior:'allow'}
    }))
    await waitFor(()=>expect(within(dialog).getByText(/FileEdit/)).toBeInTheDocument())
    await user.click(within(dialog).getByRole('button',{name:'允许本次操作'}))
    await waitFor(()=>expect(call).toHaveBeenCalledWith('permissions.decide',{
      sessionId:SECOND,permissionId:'approval-worker',decision:{behavior:'allow'}
    }))
  })

  it('MCP 配置列表可见，并将启停操作交给真实网关',async()=>{
    const user=userEvent.setup()
    render(<App/>)
    await screen.findByText('本地后台已连接')
    await user.click(screen.getByRole('button',{name:'技能与 MCP'}))
    await screen.findByText('project-mcp')
    await user.click(screen.getByRole('button',{name:'禁用'}))
    await waitFor(()=>expect(call).toHaveBeenCalledWith('mcp.toggle',{name:'project-mcp',enabled:false}))
  })

  it('模型凭证通过专用接口写入且没有明文回显',async()=>{
    const user=userEvent.setup()
    render(<App/>)
    await screen.findByText('本地后台已连接')
    await user.click(screen.getByRole('button',{name:'模型管理'}))
    await user.type(screen.getByLabelText('API Key'),'fake-testing-key-123')
    await user.click(screen.getByRole('button',{name:'保存凭证'}))
    await waitFor(()=>expect(call).toHaveBeenCalledWith('credentials.set',{provider:'openai',key:'fake-testing-key-123'}))
    await waitFor(()=>expect(screen.getByLabelText('API Key')).toHaveValue(''))
  })
  it('切换智能体协作模式后发送消息必须启用新SDK会话，旧会话仍保留',async()=>{
    const user=userEvent.setup()
    render(<App/>)
    await screen.findByText('本地后台已连接')
    await user.click(screen.getByRole('button',{name:'AI 对话'}))
    await user.type(screen.getByRole('textbox',{name:'输入任务'}),'第一次分析')
    await user.click(screen.getByRole('button',{name:'发送'}))
    await waitFor(()=>expect(call.mock.calls.filter(args=>args[0]==='sessions.open')).toHaveLength(1))

    await user.click(screen.getByRole('button',{name:'智能体团队'}))
    await user.click(screen.getByRole('button',{name:/Super Agents 团队模式/}))
    await waitFor(()=>expect(call).toHaveBeenCalledWith('agents.setMode',{mode:'super'}))
    await user.click(screen.getByRole('button',{name:'AI 对话'}))
    await waitFor(()=>expect(screen.queryByText('第一次分析')).not.toBeInTheDocument())
    await user.type(screen.getByRole('textbox',{name:'输入任务'}),'第二次分析')
    await user.click(screen.getByRole('button',{name:'发送'}))
    await waitFor(()=>expect(call.mock.calls.filter(args=>args[0]==='sessions.open')).toHaveLength(2))
    expect(call).toHaveBeenCalledWith('sessions.send',expect.objectContaining({message:'第二次分析'}))
    expect(call).not.toHaveBeenCalledWith('sessions.close',expect.anything())
  })

  it('正在执行的智能体只显示停止，停止或失败的智能体只显示继续',async()=>{
    const user=userEvent.setup()
    mockTasks=[{taskId:'task-running',description:'执行单元 A',status:'running'}]
    render(<App/>)
    await screen.findByText('本地后台已连接')
    await user.click(screen.getByRole('button',{name:'新建会话'}))
    await user.click(screen.getByRole('button',{name:'智能体团队'}))
    await screen.findByText('执行单元 A')
    expect(screen.getByRole('button',{name:'停止任务'})).toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'继续任务'})).not.toBeInTheDocument()
    await user.click(screen.getByRole('button',{name:'停止任务'}))
    await waitFor(()=>expect(call).toHaveBeenCalledWith('tasks.stop',{sessionId:SID,taskId:'task-running'}))
  })

  it('中断智能体的继续按钮真正向原SDK提交续跑要求',async()=>{
    const user=userEvent.setup()
    mockTasks=[{taskId:'task-interrupted',description:'未完成的代码审计',status:'interrupted'}]
    render(<App/>)
    await screen.findByText('本地后台已连接')
    await user.click(screen.getByRole('button',{name:'新建会话'}))
    await user.click(screen.getByRole('button',{name:'智能体团队'}))
    await screen.findByText('未完成的代码审计')
    expect(screen.queryByRole('button',{name:'停止任务'})).not.toBeInTheDocument()
    await user.click(screen.getByRole('button',{name:'继续任务'}))
    await waitFor(()=>expect(call).toHaveBeenCalledWith('tasks.resume',
      expect.objectContaining({sessionId:SID,taskId:'task-interrupted',
        prompt:expect.stringContaining('核对已有执行结果')})))
  })

})
