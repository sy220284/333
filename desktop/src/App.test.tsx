import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppEvent } from './api'

// Vitest 的 jsdom 不提供 Electron 页面使用的 Web Storage；在测试中模拟实际浏览器存储行为。
const preferenceStore=new Map<string,string>()
Object.defineProperty(window,'localStorage',{configurable:true,value:{
  getItem:(key:string)=>preferenceStore.get(key)??null,
  setItem:(key:string,value:string)=>{preferenceStore.set(key,String(value))},
  removeItem:(key:string)=>{preferenceStore.delete(key)},
  clear:()=>{preferenceStore.clear()},
  get length(){return preferenceStore.size},
  key:(index:number)=>[...preferenceStore.keys()][index]??null
}})
const SID='9b0c188a-66fd-4b30-82e0-f52f2f8dfc35'
let listener:(event:AppEvent)=>void=()=>{}
let showHistoricalJob=false
let failMcpRefresh=false
let suspendMcpRefresh=false
let releaseMcpRefresh:(()=>void)|undefined
let createdMission:{id:string;objective:string;status:string}|undefined
let activeAgentMode:'master'|'super'='master'
let mockTasks:Array<{taskId:string;description:string;status:string}>=[]
let longHistory=false
let manyFiles=false
let failModelSelection=false
let pickedOfflineWorkspace=false
const call=vi.fn(async(method:string,args:Record<string,unknown>={})=>{
  switch(method){
    case 'app.info': return {workspace:'/projects/example',platform:'linux',version:'0.1.0'}
    case 'hello':return {protocolVersion:1,capabilities:['sessions','missions','agents']}
    case 'models.list':return {models:[{value:'minimax/M3',displayName:'MiniMax M3'}]}
    case 'sessions.list':return longHistory?[{sessionId:SID,title:'长历史会话'}]:[]
    case 'agents.overview':return {mode:activeAgentMode,teams:[],missions:[],activeSessions:0,activeTasks:0}
    case 'agents.setMode': activeAgentMode=args.mode==='super'?'super':'master'; return {mode:activeAgentMode}
    case 'missions.create': {
      createdMission={id:'mission_0123456789abcdef',objective:String(args.objective),status:'active'}
      return createdMission
    }
    case 'missions.list':
      if(createdMission)return {missions:[createdMission],selectedMissionId:createdMission.id}
      return showHistoricalJob
      ? {missions:[{missionId:'mission-fixture',objective:'历史任务',status:'active'}],selectedMissionId:'mission-fixture'}
      : {missions:[],selectedMissionId:null}
    case 'missions.jobs.list':return showHistoricalJob
      ? [{id:'job-1',title:'审核旧执行',instruction:'分析来源',status:'completed',attempt:1,sessionId:SID}]
      : []
    case 'sessions.history':return longHistory?Array.from({length:260},(_,i)=>({uuid:`long-${i}`,type:'assistant',message:{role:'assistant',content:[{type:'text',text:`历史-${i}`}]},timestamp:'2026-11-06T12:00:00Z'})):[{
      uuid:'history-message-1',type:'assistant',
      message:{role:'assistant',content:[{type:'text',text:'历史执行内容'}]},
      timestamp:'2026-11-06T12:00:00Z'
    }]
    case 'sessions.ensureOpen':return {sessionId:SID,resumed:true,tasks:[]}
    case 'sessions.status':return {phase:'running'}
    case 'workspace.pick':return pickedOfflineWorkspace?{workspace:'/projects/second',changed:true,connected:false}:{workspace:'/projects/example',changed:false}
    case 'workspace.read':return {path:String(args.path),content:'原始内容'}
    case 'permissions.list':return []
    case 'host.list':return []
    case 'credentials.list':return {providers:['openai']}
    case 'workspace.list':{
      const offset=Number(args.offset||0)
      const end=manyFiles?Math.min(260,offset+Number(args.limit||200)):0
      return {path:'/projects/example',total:manyFiles?260:0,entries:Array.from({length:Math.max(0,end-offset)},(_,i)=>({name:`file-${offset+i}.ts`,path:`/projects/example/file-${offset+i}.ts`,directory:false}))}
    }
    case 'mcp.list':
      if(suspendMcpRefresh)await new Promise<void>(resolve=>{releaseMcpRefresh=resolve})
      if(failMcpRefresh)throw new Error('MCP 服务离线')
      return {servers:[{name:'project-mcp',scope:'project',type:'http',url:'https://example.org/mcp',disabled:false}],errors:[]}
    case 'sessions.open':return {sessionId:SID,tasks:mockTasks}
    case 'sessions.send':return {sessionId:SID,turnId:'11afef34-e0a6-4c38-a743-1c451993fdb8'}
    case 'sessions.setModel':if(failModelSelection)throw new Error('模型服务端拒绝切换');return {model:args.model}
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

beforeEach(()=>{call.mockClear();listener=()=>{};showHistoricalJob=false;failMcpRefresh=false;activeAgentMode='master';mockTasks=[];longHistory=false;manyFiles=false;failModelSelection=false;pickedOfflineWorkspace=false;suspendMcpRefresh=false;releaseMcpRefresh=undefined;createdMission=undefined;window.localStorage.clear()})
afterEach(()=>cleanup())

describe('摇摇车真实桌面页面交互',()=>{
  it('模型切换失败时保持原选择，避免界面显示并未生效的模型',async()=>{
    failModelSelection=true
    const user=userEvent.setup()
    render(<App/>)
    await screen.findByText('本地后台已连接')
    await user.click(screen.getByRole('button',{name:'新建会话'}))
    await user.click(screen.getByRole('button',{name:'模型管理'}))
    const card=screen.getByText('MiniMax M3').closest('button')
    expect(card).not.toBeNull()
    if(!card)throw new Error('模型选择按钮未渲染')
    await user.click(card)
    await screen.findByText('模型服务端拒绝切换')
    expect(card).not.toHaveClass('selected')
    expect(call).toHaveBeenCalledWith('sessions.setModel',{sessionId:SID,model:'minimax/M3'})
  })


  it('侧栏恢复会话后读取真实执行状态，避免显示前一个会话的状态',async()=>{
    longHistory=true
    render(<App/>)
    await screen.findByText('本地后台已连接')
    const user=userEvent.setup()
    await user.click(screen.getByRole('button',{name:'恢复会话：长历史会话'}))
    await waitFor(()=>expect(call).toHaveBeenCalledWith('sessions.status',{sessionId:SID}))
  })

  it('切换断开的工作区会清空旧项目会话列表',async()=>{
    longHistory=true
    pickedOfflineWorkspace=true
    const user=userEvent.setup()
    render(<App/>)
    await screen.findByText('本地后台已连接')
    expect(screen.getByRole('button',{name:'恢复会话：长历史会话'})).toBeInTheDocument()
    await user.click(screen.getByTitle('/projects/example'))
    await waitFor(()=>expect(screen.queryByRole('button',{name:'恢复会话：长历史会话'})).not.toBeInTheDocument())
    expect(screen.getByText('后台未连接')).toBeInTheDocument()
  })

  it('打开新文件前会确认是否丢弃旧文件未保存的修改',async()=>{
    manyFiles=true
    const user=userEvent.setup()
    const confirm=vi.spyOn(window,'confirm').mockReturnValue(false)
    try{
      render(<App/>)
      await screen.findByText('本地后台已连接')
      await user.click(screen.getByRole('button',{name:'项目文件'}))
      await user.click(screen.getByRole('button',{name:'刷新文件'}))
      await user.click(await screen.findByText('file-0.ts'))
      const editor=await screen.findByRole('textbox',{name:'编辑当前文件'})
      await user.clear(editor)
      await user.type(editor,'未保存修改')
      await user.click(screen.getByText('file-1.ts'))
      expect(confirm).toHaveBeenCalled()
      expect(editor).toHaveValue('未保存修改')
      expect(call).not.toHaveBeenCalledWith('workspace.read',{path:'/projects/example/file-1.ts'})
    }finally{confirm.mockRestore()}
  })
  it('新界面原生首页使用任务启动而非旧仪表盘，点击建议可进入真实输入流',async()=>{
    const user=userEvent.setup()
    render(<App/>)
    await screen.findByText('本地后台已连接')
    expect(screen.getByRole('heading',{name:'今天，从哪里开始？'})).toBeInTheDocument()
    expect(screen.getByRole('button',{name:'新建会话'})).toBeInTheDocument()
    await user.click(screen.getByRole('button',{name:/分析当前项目结构/}))
    expect(screen.getByRole('textbox',{name:'输入任务'})).toHaveValue('请分析当前项目的架构、主要模块与调用关系')
    await user.click(screen.getByRole('button',{name:'发送'}))
    await waitFor(()=>expect(call).toHaveBeenCalledWith('sessions.send',{
      sessionId:SID,message:'请分析当前项目的架构、主要模块与调用关系'
    }))
  })

  it('六套主题可以切换并在重新打开时恢复',async()=>{
    const user=userEvent.setup()
    const view=render(<App/>)
    await screen.findByText('本地后台已连接')
    await user.click(screen.getByRole('button',{name:'设置与权限'}))
    const selector=screen.getByRole('combobox',{name:'界面主题'})
    expect(selector).toHaveValue('white')
    await user.selectOptions(selector,'celadon')
    expect(document.documentElement.dataset.theme).toBe('celadon')
    view.unmount()
    render(<App/>)
    await screen.findByText('本地后台已连接')
    await user.click(screen.getByRole('button',{name:'设置与权限'}))
    expect(screen.getByRole('combobox',{name:'界面主题'})).toHaveValue('celadon')
    await user.selectOptions(screen.getByRole('combobox',{name:'界面主题'}),'ink-blue')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('替换后的项目侧栏可直接恢复真实会话并选中会话标签',async()=>{
    longHistory=true
    const user=userEvent.setup()
    render(<App/>)
    await screen.findByText('本地后台已连接')
    expect(screen.getByRole('navigation',{name:'主要导航'})).toBeInTheDocument()
    const recent=screen.getByRole('button',{name:'恢复会话：长历史会话'})
    await user.click(recent)
    await waitFor(()=>expect(call).toHaveBeenCalledWith('sessions.ensureOpen',{sessionId:SID}))
    expect(screen.getByRole('tab',{name:'标签页：会话 · 长历史会话'})).toHaveAttribute('aria-selected','true')
    await user.click(screen.getByRole('button',{name:'项目文件'}))
    expect(screen.getByRole('tab',{name:'标签页：项目文件'})).toHaveAttribute('aria-selected','true')
    await user.click(screen.getByRole('tab',{name:'标签页：会话 · 长历史会话'}))
    expect(screen.getByRole('tab',{name:'标签页：会话 · 长历史会话'})).toHaveAttribute('aria-selected','true')
  })

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

  it('长期任务创建后立即显示结果，MCP 服务卡住也不影响用户操作',async()=>{
    suspendMcpRefresh=true
    const user=userEvent.setup()
    render(<App/>)
    await screen.findByText('本地后台已连接')
    await user.click(screen.getByRole('button',{name:'长期任务'}))
    await user.type(screen.getByPlaceholderText('明确长期目标与交付要求…'),'真实安装版任务创建测试')
    const probesBefore=call.mock.calls.filter(args=>args[0]==='models.list').length
    const mcpBefore=call.mock.calls.filter(args=>args[0]==='mcp.list').length
    await user.click(screen.getByRole('button',{name:'创建并选中任务'}))
    await waitFor(()=>expect(screen.getByRole('heading',{name:'真实安装版任务创建测试'})).toBeInTheDocument())
    expect(screen.getByText('Super Agents 工作项')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('明确长期目标与交付要求…')).toHaveValue('')
    expect(screen.getByRole('button',{name:'创建并选中任务'})).toBeDisabled() // no duplicate submission from an empty form
    expect(call).toHaveBeenCalledWith('missions.create',{objective:'真实安装版任务创建测试'})
    expect(call.mock.calls.filter(args=>args[0]==='models.list')).toHaveLength(probesBefore)
    expect(call.mock.calls.filter(args=>args[0]==='mcp.list')).toHaveLength(mcpBefore)
    await act(async()=>{suspendMcpRefresh=false;releaseMcpRefresh?.()})
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

  it('不同会话复用同一个审批编号时都保留请求并分别审批',async()=>{
    const user=userEvent.setup()
    const other='cb5f81c9-782d-4b79-a7ba-b43db0249a1c'
    render(<App/>)
    await screen.findByText('本地后台已连接')
    await act(async()=>{
      listener({event:'permission.request',sessionId:SID,permission:{id:'req-1',toolName:'Bash',input:{command:'git status'}}})
      listener({event:'permission.request',sessionId:other,permission:{id:'req-1',toolName:'FileEdit',input:{file_path:'other.ts'}}})
    })
    const dialog=screen.getByRole('dialog',{name:'工具权限审批'})
    expect(within(dialog).getByText(/另有 1 项待审操作/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button',{name:'允许本次操作'}))
    await waitFor(()=>expect(call).toHaveBeenCalledWith('permissions.decide',{
      sessionId:SID,permissionId:'req-1',decision:{behavior:'allow'}
    }))
    await waitFor(()=>expect(within(dialog).getByText(/FileEdit/)).toBeInTheDocument())
    await user.click(within(dialog).getByRole('button',{name:'允许本次操作'}))
    await waitFor(()=>expect(call).toHaveBeenCalledWith('permissions.decide',{
      sessionId:other,permissionId:'req-1',decision:{behavior:'allow'}
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

  it('全局命令中心可以搜索并进入对应页面',async()=>{
    const user=userEvent.setup()
    render(<App/>)
    await screen.findByText('本地后台已连接')
    await user.keyboard('{Control>}k{/Control}')
    const palette=await screen.findByRole('dialog',{name:'快速操作'})
    await user.type(within(palette).getByRole('textbox',{name:'搜索命令'}),'历史记录')
    expect(within(palette).getByRole('option',{name:/历史记录/})).toBeInTheDocument()
    await user.keyboard('{Enter}')
    await screen.findByRole('heading',{name:'历史记录'})
    expect(screen.queryByRole('dialog',{name:'快速操作'})).not.toBeInTheDocument()
  })

  it('长对话默认只渲染最近120条，历史消息可按需逐段展开',async()=>{
    longHistory=true
    const user=userEvent.setup()
    render(<App/>)
    await screen.findByText('本地后台已连接')
    await user.click(screen.getByRole('button',{name:'长历史会话'}))
    await screen.findByText('历史-259')
    expect(screen.queryByText('历史-0')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button',{name:/加载更早的 120 条消息/}))
    expect(screen.queryByText('历史-0')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button',{name:/加载更早的 20 条消息/}))
    expect(screen.getByText('历史-0')).toBeInTheDocument()
  })

  it('文件列表分页向网关请求下一页并展示累计数量',async()=>{
    manyFiles=true
    const user=userEvent.setup()
    render(<App/>)
    await screen.findByText('本地后台已连接')
    await user.click(screen.getByRole('button',{name:'项目文件'}))
    await user.click(screen.getByRole('button',{name:'刷新文件'}))
    await screen.findByText('file-199.ts')
    const more=screen.getByRole('button',{name:/加载更多文件/})
    expect(more).toHaveTextContent('200/260')
    await user.click(more)
    await screen.findByText('file-259.ts')
    expect(call).toHaveBeenCalledWith('workspace.list',{path:'/projects/example',offset:200,limit:200})
    expect(screen.queryByRole('button',{name:/加载更多文件/})).not.toBeInTheDocument()
  })

  it('外观和详情面板偏好在重启后仍保留',async()=>{
    const user=userEvent.setup()
    const instance=render(<App/>)
    await screen.findByText('本地后台已连接')
    await user.click(screen.getByRole('button',{name:'设置与权限'}))
    const darkSwitch=screen.getByRole('checkbox',{name:/深色主题/}) as HTMLInputElement
    const expectedDark=!darkSwitch.checked
    await user.click(darkSwitch)
    await waitFor(()=>expect(window.localStorage.getItem('yaoyaoche-desktop:dark')).toBe(String(expectedDark)))
    await user.click(screen.getByRole('button',{name:'收起详情'}))
    await waitFor(()=>expect(window.localStorage.getItem('yaoyaoche-desktop:inspector')).toBe('false'))
    instance.unmount()
    render(<App/>)
    await screen.findByText('本地后台已连接')
    expect(document.documentElement.dataset.theme).toBe(expectedDark?'dark':'light')
    expect(screen.getByRole('button',{name:'打开详情面板'})).toBeInTheDocument()
  })

})
