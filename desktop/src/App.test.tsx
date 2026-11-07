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
const PROFILE_ID='4210ae09-3494-44b6-9fb7-3937df0156a9'
const ROLE_ID='80c707e0-225c-44aa-ac39-cb7504d5cb85'
const HANDOFF_ID='74f15899-aa6c-45e5-83ce-f2876994910e'
const OTHER='e9c46d7b-2766-49c8-9f2d-142c90a45d5a'
let listener:(event:AppEvent)=>void=()=>{}
let showHistoricalJob=false
let stableMissionJobs=false
let failMcpRefresh=false
let suspendMcpRefresh=false
let releaseMcpRefresh:(()=>void)|undefined
let createdMission:{id:string;objective:string;status:string}|undefined
let activeAgentMode:'master'|'super'='master'
let mockTeam:{name:string;leadSessionId:string;memberCount:number;runningCount:number}|undefined
let failTeamDeliveryAck=false
let mockTasks:Array<{taskId:string;description:string;status:string}>=[]
let showAgentActivitySample=false
let showProfileSample=false
let showHandoffReview=false
let budgetState:{limitUsd:number|null;spentUsd:number;reservedUsd:number;availableUsd:number|null;uncertainReservations:number;activeReservations:number;
  uncertain:Array<{id:string;reservedUsd:number;startedAt:string}>}={
  limitUsd:null,spentUsd:0,reservedUsd:0,availableUsd:null,uncertainReservations:0,activeReservations:0,uncertain:[]}
let smartRecord:{sessionId:string;model:string;permissionMode:string;status:'running'|'completed'|'failed'|'interrupted';startedAt:string;costUsd?:number;budgetUsd?:number}|undefined
let longHistory=false
let manyFiles=false
let failModelSelection=false
let pickedOfflineWorkspace=false
let twoSessions=false
let delayedHistoryId=''
let releaseHistory:(()=>void)|undefined
let delayedSessionList=false
let releaseSessionList:(()=>void)|undefined
let delayedSave=false
let releaseSave:(()=>void)|undefined
let delayedApprovalLists=false
let releasePermissionList:(()=>void)|undefined
let releaseHostList:(()=>void)|undefined
const call=vi.fn(async(method:string,args:Record<string,unknown>={})=>{
  switch(method){
    case 'app.info': return {workspace:'/projects/example',platform:'linux',version:'0.1.0'}
    case 'hello':return {protocolVersion:1,capabilities:['sessions','missions','agents']}
    case 'models.list':return {models:[{value:'minimax/M3',displayName:'MiniMax M3'},{value:'minimax/M4',displayName:'MiniMax M4'}]}
    case 'smart.inspect':return {model:String(args.model||'minimax/M3'),status:'configured',message:'本地模型已就绪',checkedOffline:true,contextWindow:64000,hasPricing:true}
    case 'smart.history':return smartRecord?[smartRecord]:[]
    case 'budget.project.get':return budgetState
    case 'budget.project.resolveUnknown':
      if(!budgetState.uncertain.some(record=>record.id===args.unknownId))throw new Error('未知费用记录 ID 与请求 ID 不一致')
      budgetState={...budgetState,uncertain:[],uncertainReservations:0,
        reservedUsd:0,spentUsd:budgetState.spentUsd+Number(args.costUsd)}
      return budgetState
    case 'budget.project.set':
      budgetState={...budgetState,limitUsd:args.limitUsd as number|null,
        availableUsd:args.limitUsd===null?null:Number(args.limitUsd)-budgetState.spentUsd-budgetState.reservedUsd}
      return budgetState
    case 'smart.execute':
      smartRecord={sessionId:SID,model:String(args.model||'minimax/M3'),permissionMode:String(args.permissionMode||'default'),
        status:'running',startedAt:new Date().toISOString(),...(args.maxBudgetUsd?{budgetUsd:Number(args.maxBudgetUsd)}:{})}
      return {sessionId:SID,prepared:true,model:smartRecord.model}
    case 'smart.start':
      listener({event:'session.message',sessionId:SID,turnId:'fast-smart',message:{
        uuid:'message-fast-smart',type:'assistant',message:{role:'assistant',content:[{type:'text',text:'智能执行已进入真实会话'}]}
      }})
      return {sessionId:SID,turnId:'fast-smart'}
    case 'sessions.list':{
      if(delayedSessionList)await new Promise<void>(resolve=>{releaseSessionList=resolve})
      return twoSessions?[{sessionId:SID,title:'会话 A'},{sessionId:OTHER,title:'会话 B'}]
        :longHistory?[{sessionId:SID,title:'长历史会话'}]:[]
    }
    case 'agents.overview':return {mode:activeAgentMode,teams:mockTeam?[mockTeam]:[],missions:[],activeSessions:0,activeTasks:0}
    case 'agents.activity':return {
      totalVisible:showAgentActivitySample?2:0,
      activities:showAgentActivitySample?[
        {id:'job:mission_0123456789abcdef:job_0123456789abcdef',source:'mission-job',title:'长期审计工作',status:'review',
         updatedAt:'2026-11-07T11:00:00Z',missionId:'mission_0123456789abcdef',jobId:'job_0123456789abcdef'},
        {id:`session:${OTHER}:agent-x`,source:'session-task',title:'另一会话检查',status:'running',
         updatedAt:'2026-11-07T10:00:00Z',sessionId:OTHER},
      ]:[],
    }
    case 'supervisor.snapshot':return {findings:[],counts:{blocked:0,review:0,followup:0}}
    case 'agents.profiles.list':return {agents:showProfileSample?[{
      id:PROFILE_ID,name:'文字研究成员',description:'维护可验证的研究与文字产出',domains:['研究','文案'],
      capabilityIds:[],experienceKeys:[],status:'available',sessionBindings:[],roles:[{
        id:ROLE_ID,role:'审校',purpose:'核查引用与复核编辑文案',state:'active',
      }],
    }]:[]}
    case 'agents.profiles.bindSession':return {agentId:args.agentId,sessionId:args.sessionId}
    case 'handoffs.list':return {handoffs:showHandoffReview?[{
      id:HANDOFF_ID,teamName:'内容团队',from:'team-lead',to:'文案',summary:'报告初稿交付验收',
      instruction:'将审核后的报告初稿交给负责人逐条核对来源和结构',
      status:'review',inputRefs:[],outputRefs:['artifact:research:report-v1'],
    }]:[]}
    case 'handoffs.approve':return {handoffId:args.handoffId,status:'completed'}
    case 'agents.members':return mockTeam?[{agentId:'agent-test',name:'测试成员',agentType:'developer',model:'fixture-model',status:'idle'}]:[]
    case 'agents.team.message':
      if(failTeamDeliveryAck){failTeamDeliveryAck=false;throw new Error('模拟信箱确认丢失')}
      return {queued:true,teamName:args.teamName,recipient:args.to,messageId:args.messageId}
    case 'agents.team.inbox':return {teamName:args.teamName,memberName:args.memberName,messages:[
      {from:'team-lead',text:'已提交检查任务',timestamp:'2026-11-07T12:00:00Z',read:false,messageId:SID},
    ]}
    case 'agents.setMode': activeAgentMode=args.mode==='super'?'super':'master'; return {mode:activeAgentMode}
    case 'missions.create': {
      createdMission={id:'mission_0123456789abcdef',objective:String(args.objective),status:'active'}
      return createdMission
    }
    case 'missions.list':
      if(stableMissionJobs)return {missions:[{missionId:'mission-fixture',objective:'稳定工作项任务',status:'active'}],selectedMissionId:'mission-fixture'}
      if(createdMission)return {missions:[createdMission],selectedMissionId:createdMission.id}
      return showHistoricalJob
      ? {missions:[{missionId:'mission-fixture',objective:'历史任务',status:'active'}],selectedMissionId:'mission-fixture'}
      : {missions:[],selectedMissionId:null}
    case 'missions.jobs.list':return stableMissionJobs
      ? [{id:'job-1',title:'先执行',instruction:'第一步',status:'queued',attempt:1},{id:'job-2',title:'后执行',instruction:'第二步',status:'queued',attempt:1}]
      : showHistoricalJob
      ? [{id:'job-1',title:'审核旧执行',instruction:'分析来源',status:'completed',attempt:1,sessionId:SID}]
      : []
    case 'sessions.history':{
      if(delayedHistoryId===args.sessionId)await new Promise<void>(resolve=>{releaseHistory=resolve})
      const data=longHistory?Array.from({length:260},(_,i)=>({uuid:`long-${i}`,type:'assistant',message:{role:'assistant',content:[{type:'text',text:`历史-${i}`}]},timestamp:'2026-11-06T12:00:00Z'})):[{
        uuid:`history-${String(args.sessionId||SID)}`,type:'assistant',
        message:{role:'assistant',content:[{type:'text',text:twoSessions?(args.sessionId===SID?'会话 A 内容':'会话 B 内容'):'历史执行内容'}]},
        timestamp:'2026-11-06T12:00:00Z'
      }]
      const skip=Number(args.offset||0),limit=Number(args.limit||200)
      const end=args.tail?Math.max(0,data.length-skip):Math.min(data.length,skip+limit)
      const offset=args.tail?Math.max(0,end-limit):skip
      const messages=data.slice(offset,end)
      return args.tail?{messages,total:data.length,offset}:messages
    }
    case 'sessions.ensureOpen':return {sessionId:String(args.sessionId),resumed:true,tasks:[],model:args.sessionId===OTHER?'minimax/M4':'minimax/M3',permissionMode:args.sessionId===OTHER?'plan':'default'}
    case 'sessions.status':return {phase:args.sessionId===OTHER?'idle':'running',model:args.sessionId===OTHER?'minimax/M4':'minimax/M3',permissionMode:args.sessionId===OTHER?'plan':'default'}
    case 'workspace.pick':return pickedOfflineWorkspace?{workspace:'/projects/second',changed:true,connected:false}:{workspace:'/projects/example',changed:false}
    case 'workspace.read':return {path:String(args.path),content:String(args.path).includes('file-1')?'第二个文件':'原始内容'}
    case 'workspace.write':{
      if(delayedSave)await new Promise<void>(resolve=>{releaseSave=resolve})
      return {saved:true,path:args.path}
    }
    case 'permissions.list':{
      if(delayedApprovalLists)await new Promise<void>(resolve=>{releasePermissionList=resolve})
      return []
    }
    case 'host.list':{
      if(delayedApprovalLists)await new Promise<void>(resolve=>{releaseHostList=resolve})
      return []
    }
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
    case 'sessions.open':return {sessionId:SID,tasks:mockTasks,model:'minimax/M3',permissionMode:'default'}
    case 'sessions.send':
      if(String(args.message).includes('TeamCreate'))listener({
        event:'session.message',sessionId:SID,turnId:'11afef34-e0a6-4c38-a743-1c451993fdb8',
        message:{uuid:'message-fast-team',type:'assistant',message:{role:'assistant',content:[{type:'text',text:'已收到团队建队请求，等待工具确认'}]}}
      })
      return {sessionId:SID,turnId:'11afef34-e0a6-4c38-a743-1c451993fdb8'}
    case 'sessions.setModel':if(failModelSelection)throw new Error('模型服务端拒绝切换');return {model:args.model}
    case 'permissions.decide':return {permissionId:args.permissionId,accepted:true}
    case 'credentials.set':return {saved:true}
    case 'mcp.toggle':return {name:args.name,enabled:args.enabled}
    case 'mcp.add':return {name:args.name,added:true}
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

beforeEach(()=>{call.mockClear();listener=()=>{};failTeamDeliveryAck=false;showHistoricalJob=false;stableMissionJobs=false;failMcpRefresh=false;activeAgentMode='master';mockTeam=undefined;mockTasks=[];showAgentActivitySample=false;showProfileSample=false;showHandoffReview=false;smartRecord=undefined;budgetState={limitUsd:null,spentUsd:0,reservedUsd:0,availableUsd:null,uncertainReservations:0,activeReservations:0,uncertain:[]};longHistory=false;manyFiles=false;failModelSelection=false;pickedOfflineWorkspace=false;suspendMcpRefresh=false;releaseMcpRefresh=undefined;createdMission=undefined;twoSessions=false;delayedHistoryId='';releaseHistory=undefined;delayedSessionList=false;releaseSessionList=undefined;delayedSave=false;releaseSave=undefined;delayedApprovalLists=false;releasePermissionList=undefined;releaseHostList=undefined;window.localStorage.clear()})
afterEach(()=>cleanup())

describe('摇摇车真实桌面页面交互',()=>{
  it('已打开会话选择默认模型会清除SDK模型覆盖，而非发送空模型名',async()=>{
    const user=userEvent.setup()
    render(<App/>)
    await screen.findByText('本地后台已连接')
    await user.click(screen.getByRole('button',{name:'新建会话'}))
    const selector=await screen.findByRole('combobox',{name:'当前模型'})
    await waitFor(()=>expect(selector).toHaveValue('minimax/M3'))
    await user.selectOptions(selector,'')
    await waitFor(()=>expect(call).toHaveBeenCalledWith('sessions.setModel',{
      sessionId:SID,model:null,
    }))
    expect(selector).toHaveValue('')
  })

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
    expect(screen.getByRole('button',{name:'智能执行'})).toBeDisabled()
    await user.click(screen.getByRole('button',{name:/分析当前项目结构/}))
    expect(screen.getByRole('textbox',{name:'智能执行任务'})).toHaveValue('请分析当前项目的架构、主要模块与调用关系')
    await user.click(screen.getByRole('button',{name:'智能执行'}))
    await waitFor(()=>expect(call).toHaveBeenCalledWith('smart.execute',expect.objectContaining({
      prompt:'请分析当前项目的架构、主要模块与调用关系',deferStart:true
    })))
    expect(call).toHaveBeenCalledWith('smart.start',{sessionId:SID})
    expect(await screen.findByText('智能执行已进入真实会话')).toBeInTheDocument()
  })

  it('智能执行高级模型、预算、权限选择进入 SDK，费用状态显示在新 UI',async()=>{
    const user=userEvent.setup()
    render(<App/>)
    await screen.findByText('本地后台已连接')
    await user.type(screen.getByRole('textbox',{name:'智能执行任务'}),'检查项目依赖')
    await user.click(screen.getByRole('button',{name:'高级选项'}))
    await user.selectOptions(screen.getByRole('combobox',{name:'智能执行模型'}),'minimax/M3')
    await user.type(screen.getByRole('spinbutton',{name:'智能执行费用上限'}),'2.50')
    await user.selectOptions(screen.getByRole('combobox',{name:'智能执行权限'}),'plan')
    await user.click(screen.getByRole('button',{name:'智能执行'}))
    await waitFor(()=>expect(call).toHaveBeenCalledWith('smart.execute',expect.objectContaining({
      model:'minimax/M3',maxBudgetUsd:2.5,permissionMode:'plan',deferStart:true,
    })))
    expect(screen.getByText('智能执行已进入真实会话')).toBeInTheDocument()
    await waitFor(()=>expect(screen.getAllByText(/上限 USD 2.50/).length).toBeGreaterThan(0))
  })

  it('工作项模型和权限选择实际写入任务队列，不修改其他智能体',async()=>{
    const user=userEvent.setup()
    render(<App/>)
    await screen.findByText('本地后台已连接')
    await user.click(screen.getByRole('button',{name:'长期任务'}))
    await user.type(screen.getByPlaceholderText('明确长期目标与交付要求…'),'不同模型协作')
    await user.click(screen.getByRole('button',{name:'创建并选中任务'}))
    await screen.findByRole('heading',{name:'不同模型协作'})
    await user.type(screen.getByRole('textbox',{name:'工作项标题'}),'专属规划智能体')
    await user.type(screen.getByRole('textbox',{name:'工作项执行指令'}),'分析项目调用链')
    await user.selectOptions(screen.getByRole('combobox',{name:'工作项执行模型'}),'minimax/M3')
    await user.selectOptions(screen.getByRole('combobox',{name:'工作项工具权限'}),'plan')
    await user.click(screen.getByRole('button',{name:'添加工作项'}))
    await waitFor(()=>expect(call).toHaveBeenCalledWith('missions.jobs.enqueue',expect.objectContaining({
      model:'minimax/M3',permissionMode:'plan',
    })))
  })


  it('长期工作项选定稳定身份角色后写入真实入队协议',async()=>{
    showProfileSample=true
    const user=userEvent.setup()
    render(<App/>)
    await screen.findByText('本地后台已连接')
    await user.click(screen.getByRole('button',{name:'长期任务'}))
    await user.type(screen.getByPlaceholderText('明确长期目标与交付要求…'),'研究与审校的长期目标')
    await user.click(screen.getByRole('button',{name:'创建并选中任务'}))
    await screen.findByRole('heading',{name:'研究与审校的长期目标'})
    await user.selectOptions(screen.getByRole('combobox',{name:'指定长期智能体角色'}),`${PROFILE_ID}|${ROLE_ID}`)
    await user.type(screen.getByRole('textbox',{name:'工作项标题'}),'检验研究来源')
    await user.type(screen.getByRole('textbox',{name:'工作项执行指令'}),'核查原始引用和审校结论')
    await user.click(screen.getByRole('button',{name:'添加工作项'}))
    await waitFor(()=>expect(call).toHaveBeenCalledWith('missions.jobs.enqueue',expect.objectContaining({
      agentProfileId:PROFILE_ID,roleId:ROLE_ID,
    })))
  })

  it('工作项实时更新保持原位置，新工作项追加到末尾并短暂标记更新',async()=>{
    stableMissionJobs=true
    const user=userEvent.setup()
    render(<App/>)
    await screen.findByText('本地后台已连接')
    await user.click(screen.getByRole('button',{name:'长期任务'}))
    await screen.findByText('先执行')
    await screen.findByText('后执行')
    const titles=()=>Array.from(document.querySelectorAll('.yy-job-card h4'),node=>node.textContent)
    expect(titles()).toEqual(['先执行','后执行'])
    await act(async()=>listener({event:'mission.job.updated',missionId:'mission-fixture',job:{
      id:'job-1',title:'先执行',instruction:'第一步已完成',status:'completed',attempt:1,updatedAt:'2026-11-07T12:00:00Z',
    }}))
    expect(titles()).toEqual(['先执行','后执行'])
    expect(document.querySelector('.yy-job-card')).toHaveAttribute('data-updated','true')
    await act(async()=>listener({event:'mission.job.updated',missionId:'mission-fixture',job:{
      id:'job-3',title:'新追加',instruction:'第三步',status:'queued',attempt:1,updatedAt:'2026-11-07T12:01:00Z',
    }}))
    expect(titles()).toEqual(['先执行','后执行','新追加'])
  })

  it('项目共享预算从新 UI 配置到真实本地网关，并显示使用与预占',async()=>{
    const user=userEvent.setup()
    render(<App/>)
    await screen.findByText('本地后台已连接')
    await user.type(screen.getByRole('spinbutton',{name:'项目共享预算'}),'5.00')
    await user.click(screen.getByRole('button',{name:'保存项目预算'}))
    await waitFor(()=>expect(call).toHaveBeenCalledWith('budget.project.set',{limitUsd:5}))
    expect(await screen.findByText(/可用 USD 5.0000/)).toBeInTheDocument()
  })

  it('未知费用核销沿桌面 UI 到 IPC 保持真实账单 ID，而不是通信请求 ID',async()=>{
    const unknownId='7b4c910e-3f59-47da-8f42-4c2d3c8fe175'
    budgetState={limitUsd:1,spentUsd:0,reservedUsd:0.4,availableUsd:0.6,
      uncertainReservations:1,activeReservations:0,
      uncertain:[{id:unknownId,reservedUsd:0.4,startedAt:'2026-11-07T00:00:00Z'}]}
    const user=userEvent.setup()
    const confirm=vi.spyOn(window,'confirm').mockReturnValue(true)
    try{
      render(<App/>)
      await screen.findByText('本地后台已连接')
      await user.type(await screen.findByRole('spinbutton',{name:`核实费用 ${unknownId.slice(0,8)}`}), '0.25')
      await user.click(screen.getByRole('button',{name:'确认实际账单并释放预占'}))
      await waitFor(()=>expect(call).toHaveBeenCalledWith('budget.project.resolveUnknown',{unknownId,costUsd:0.25}))
      expect(budgetState.uncertainReservations).toBe(0)
    }finally{confirm.mockRestore()}
  })

  it('模型离线自检提供实际档案，无需在线模型请求',async()=>{
    const user=userEvent.setup()
    render(<App/>)
    await screen.findByText('本地后台已连接')
    await user.click(screen.getByRole('button',{name:'模型管理'}))
    await user.click(screen.getByRole('button',{name:/检查配置/}))
    await waitFor(()=>expect(call).toHaveBeenCalledWith('smart.inspect',expect.any(Object)))
    expect(await screen.findByText(/模型自检 ·/)).toBeInTheDocument()
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
    expect(document.documentElement.dataset.theme).toBe('ink-blue')
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


  it('标签方向键与 Home/End 只移动焦点，不创建或恢复会话',async()=>{
    longHistory=true
    const user=userEvent.setup()
    render(<App/>)
    await screen.findByText('本地后台已连接')
    await user.click(screen.getByRole('button',{name:'恢复会话：长历史会话'}))
    const current=await screen.findByRole('tab',{name:'标签页：会话 · 长历史会话'})
    const fresh=screen.getByRole('tab',{name:'标签页：新会话'})
    call.mockClear()
    current.focus()
    await user.keyboard('{ArrowLeft}')
    expect(fresh).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    expect(current).toHaveFocus()
    await user.keyboard('{Home}')
    expect(fresh).toHaveFocus()
    await user.keyboard('{End}')
    expect(current).toHaveFocus()
    expect(current).toHaveAttribute('aria-selected','true')
    expect(call).not.toHaveBeenCalledWith('sessions.open',expect.anything())
    expect(call).not.toHaveBeenCalledWith('sessions.ensureOpen',expect.anything())
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


  it('成功操作显示可关闭的反馈，不覆盖错误处理',async()=>{
    const user=userEvent.setup()
    render(<App/>)
    await screen.findByText('本地后台已连接')
    await user.click(screen.getByRole('button',{name:'历史记录'}))
    await user.click(screen.getByRole('button',{name:'刷新'}))
    expect(await screen.findByText('刷新历史完成')).toBeInTheDocument()
    await user.click(screen.getByRole('button',{name:'关闭操作反馈'}))
    expect(screen.queryByText('刷新历史完成')).not.toBeInTheDocument()
  })

  it('MCP 表单缺必填值时留在当前请求，数字与枚举类型正确后才回传接受',async()=>{
    const user=userEvent.setup()
    render(<App/>)
    await screen.findByText('本地后台已连接')
    await act(async()=>listener({event:'host.request',sessionId:SID,request:{
      id:'mcp-form-1',request:{subtype:'elicitation',mode:'form',
        mcp_server_name:'审核服务',message:'填写审计任务信息',
        requested_schema:{type:'object',required:['name','attempts'],properties:{
          name:{type:'string',title:'任务名称',minLength:2},
          attempts:{type:'integer',title:'尝试次数',minimum:1},
          approved:{type:'boolean',title:'已审核'},
          priority:{type:'integer',title:'优先级',enum:[1,2]},
        }}
      }
    }}))
    const dialog=await screen.findByRole('dialog',{name:'主机交互请求'})
    await user.click(within(dialog).getByRole('button',{name:'提交输入'}))
    expect(call).not.toHaveBeenCalledWith('host.respond',expect.anything())
    expect(await screen.findByRole('alert')).toHaveTextContent(/请填写 MCP 必填字段/)
    await user.type(within(dialog).getByRole('textbox',{name:/任务名称/}),'长篇小说审计')
    await user.type(within(dialog).getByRole('spinbutton',{name:/尝试次数/}),'2')
    await user.selectOptions(within(dialog).getByRole('combobox',{name:/优先级/}),'2')
    await user.click(within(dialog).getByRole('button',{name:'提交输入'}))
    await waitFor(()=>expect(call).toHaveBeenCalledWith('host.respond',{
      sessionId:SID,requestId:'mcp-form-1',
      response:{action:'accept',content:{name:'长篇小说审计',attempts:2,approved:false,priority:2}}
    }))
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
    await waitFor(()=>expect(call).toHaveBeenCalledWith('smart.execute',expect.objectContaining({prompt:'分析这个项目',deferStart:true})))
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

  it('设置页按会话和编号精确审批，即使不同 SDK 会话使用了相同编号',async()=>{
    const user=userEvent.setup()
    const SECOND='e9c46d7b-2766-49c8-9f2d-142c90a45d5a'
    render(<App/>)
    await screen.findByText('本地后台已连接')
    await user.click(screen.getByRole('button',{name:'设置与权限'}))
    await act(async()=>{
      listener({event:'permission.request',sessionId:SID,permission:{id:'same-request',toolName:'Bash',input:{command:'git status'}}})
      listener({event:'permission.request',sessionId:SECOND,permission:{id:'same-request',toolName:'FileEdit',input:{file_path:'other.ts'}}})
    })
    const buttons=screen.getAllByRole('button',{name:'本次允许'})
    expect(buttons).toHaveLength(2)
    await user.click(buttons[1])
    await waitFor(()=>expect(call).toHaveBeenCalledWith('permissions.decide',{
      sessionId:SECOND,permissionId:'same-request',decision:{behavior:'allow'}
    }))
    expect(call).not.toHaveBeenCalledWith('permissions.decide',{
      sessionId:SID,permissionId:'same-request',decision:{behavior:'allow'}
    })
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
    await user.click(screen.getByRole('button',{name:'能力中心'}))
    await screen.findByText('project-mcp')
    await user.click(screen.getByRole('button',{name:'禁用'}))
    await waitFor(()=>expect(call).toHaveBeenCalledWith('mcp.toggle',{name:'project-mcp',enabled:false}))
  })


  it('已有 MCP 服务时可展开添加表单，输入不会令其意外收起',async()=>{
    const user=userEvent.setup()
    render(<App/>)
    await screen.findByText('本地后台已连接')
    await user.click(screen.getByRole('button',{name:'能力中心'}))
    await screen.findByText('project-mcp')
    const details=document.querySelector<HTMLDetailsElement>('.yy-mcp-add')
    expect(details).not.toBeNull()
    await waitFor(()=>expect(details).not.toHaveAttribute('open'))
    await user.click(screen.getByText('添加 MCP 服务'))
    expect(details).toHaveAttribute('open')
    const name=screen.getByRole('textbox',{name:'名称'})
    await user.type(name,'added-mcp')
    expect(name).toBeVisible()
    expect(details).toHaveAttribute('open')
    await user.type(screen.getByRole('textbox',{name:'服务器 URL'}),'https://added.example.com/mcp')
    await user.click(screen.getByRole('button',{name:'添加服务'}))
    await waitFor(()=>expect(call).toHaveBeenCalledWith('mcp.add',{
      name:'added-mcp',scope:'project',config:{type:'http',url:'https://added.example.com/mcp'},
    }))
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
  it('创建团队入口先验证用户目标，再将真实 TeamCreate 指令提交给 SDK，会话能接续执行',async()=>{
    const user=userEvent.setup()
    render(<App/>)
    await screen.findByText('本地后台已连接')
    await user.click(screen.getByRole('button',{name:'智能体团队'}))
    await user.click(screen.getByRole('button',{name:/Super Agents 团队模式/}))
    await waitFor(()=>expect(call).toHaveBeenCalledWith('agents.setMode',{mode:'super'}))
    await user.click(screen.getByRole('button',{name:'长期任务'}))
    await user.type(screen.getByPlaceholderText('明确长期目标与交付要求…'),'构建真实团队')
    await user.click(screen.getByRole('button',{name:'创建并选中任务'}))
    await screen.findByRole('heading',{name:'构建真实团队'})
    await user.click(screen.getByRole('button',{name:'智能体团队'}))
    await user.type(screen.getByRole('textbox',{name:'新团队名称'}),'代码验证组')
    await user.type(screen.getByRole('textbox',{name:'新团队目标'}),'代码检查及自动化测试')
    await user.click(screen.getByRole('button',{name:'请求建立团队'}))
    await waitFor(()=>expect(call).toHaveBeenCalledWith('sessions.send',expect.objectContaining({
      sessionId:SID,message:expect.stringContaining('TeamCreate')
    })))
    expect(call).toHaveBeenCalledWith('sessions.open',expect.any(Object))
    expect(screen.getByRole('textbox',{name:'输入任务'})).toBeInTheDocument()
    expect(screen.getByText('已收到团队建队请求，等待工具确认')).toBeInTheDocument()
    const prior=call.mock.calls.filter(entry=>entry[0]==='agents.overview').length
    await act(async()=>listener({
      event:'session.message',sessionId:SID,turnId:'11afef34-e0a6-4c38-a743-1c451993fdb8',
      message:{type:'result',subtype:'success',result:'团队建队工具已返回'}
    }))
    await waitFor(()=>expect(call.mock.calls.filter(entry=>entry[0]==='agents.overview').length).toBeGreaterThan(prior))
  })

  it('跨模式总览从统一查询获取历史任务，并接收其他会话实时更新且不污染当前任务',async()=>{
    showAgentActivitySample=true
    const user=userEvent.setup()
    render(<App/>)
    await screen.findByText('本地后台已连接')
    await user.click(screen.getByRole('button',{name:'智能体团队'}))
    await screen.findByText('长期审计工作')
    expect(screen.getByText('另一会话检查')).toBeInTheDocument()
    expect(call).toHaveBeenCalledWith('agents.activity')
    await act(async()=>listener({
      event:'task.updated',sessionId:OTHER,
      task:{taskId:'new-agent',description:'跨会话并行核查',status:'running'},
    }))
    expect(await screen.findByText('跨会话并行核查')).toBeInTheDocument()
    expect(screen.getByText('尚无运行中的智能体任务')).toBeInTheDocument()
  })

  it('团队增员由原生 AgentTool 执行，需有效长期目标和用户确认',async()=>{
    mockTeam={name:'原团队',leadSessionId:SID,memberCount:1,runningCount:0}
    const user=userEvent.setup()
    const confirm=vi.spyOn(window,'confirm').mockReturnValue(true)
    try{
      render(<App/>)
      await screen.findByText('本地后台已连接')
      await user.click(screen.getByRole('button',{name:'智能体团队'}))
      await user.click(screen.getByRole('button',{name:/Super Agents 团队模式/}))
      await waitFor(()=>expect(call).toHaveBeenCalledWith('agents.setMode',{mode:'super'}))
      await user.click(screen.getByRole('button',{name:'智能体团队'}))
      await screen.findByText('测试成员')
      await user.type(screen.getByRole('textbox',{name:'新成员名称'}),'代码复核员')
      await user.type(screen.getByRole('textbox',{name:'新成员执行任务'}),'独立检查核心调用链')
      await user.click(screen.getByRole('button',{name:'请求启动成员'}))
      await screen.findByText('请先选择并恢复有效的长期目标，再启动团队成员')
      expect(call).not.toHaveBeenCalledWith('sessions.send',expect.anything())
      await user.click(screen.getByRole('button',{name:'长期任务'}))
      await user.type(screen.getByPlaceholderText('明确长期目标与交付要求…'),'独立审计')
      await user.click(screen.getByRole('button',{name:'创建并选中任务'}))
      await screen.findByRole('heading',{name:'独立审计'})
      await user.click(screen.getByRole('button',{name:'智能体团队'}))
      await user.click(screen.getByRole('button',{name:'请求启动成员'}))
      await waitFor(()=>expect(call).toHaveBeenCalledWith('sessions.ensureOpen',{sessionId:SID}))
      await waitFor(()=>expect(call).toHaveBeenCalledWith('sessions.send',expect.objectContaining({
        sessionId:SID,message:expect.stringContaining('代码复核员'),
      })))
      const callText=String(call.mock.calls.find(args=>args[0]==='sessions.send')?.[1]?.message||'')
      expect(callText).toContain('team_name')
      expect(callText).toContain('原生 Agent 工具')
      expect(confirm).toHaveBeenCalled()
    }finally{confirm.mockRestore()}
  })

  it('成员任务经项目受限信箱投递，不增加模型调用并可查看真实消息',async()=>{
    mockTeam={name:'原团队',leadSessionId:SID,memberCount:1,runningCount:0}
    const user=userEvent.setup()
    render(<App/>)
    await screen.findByText('本地后台已连接')
    await user.click(screen.getByRole('button',{name:'智能体团队'}))
    await screen.findByText('测试成员')
    await user.click(screen.getByRole('button',{name:'选为接收人'}))
    await user.type(screen.getByRole('textbox',{name:'团队成员工作指令'}),'验证当前代码并提交测试记录')
    await user.click(screen.getByRole('button',{name:'发送成员任务'}))
    await waitFor(()=>expect(call).toHaveBeenCalledWith('agents.team.message',expect.objectContaining({
      teamName:'原团队',to:'测试成员',message:'验证当前代码并提交测试记录',
      messageId:expect.any(String),
    })))
    expect(screen.getByText(/已写入 测试成员 的团队信箱/)).toBeInTheDocument()
    expect(call).not.toHaveBeenCalledWith('sessions.send',expect.anything())
    expect(call).not.toHaveBeenCalledWith('sessions.open',expect.anything())
    await user.click(screen.getByRole('button',{name:'查看信箱'}))
    await waitFor(()=>expect(call).toHaveBeenCalledWith('agents.team.inbox',{teamName:'原团队',memberName:'测试成员'}))
    expect(screen.getByText('已提交检查任务')).toBeInTheDocument()
    expect(screen.getByText(/未读取/)).toBeInTheDocument()
  })

  it('团队信箱确认丢失后重试沿用相同消息标识，避免重复投递',async()=>{
    mockTeam={name:'原团队',leadSessionId:SID,memberCount:1,runningCount:0}
    failTeamDeliveryAck=true
    const user=userEvent.setup()
    render(<App/>)
    await screen.findByText('本地后台已连接')
    await user.click(screen.getByRole('button',{name:'智能体团队'}))
    await screen.findByText('测试成员')
    await user.click(screen.getByRole('button',{name:'选为接收人'}))
    await user.type(screen.getByRole('textbox',{name:'团队成员工作指令'}),'确认重试一致性')
    await user.click(screen.getByRole('button',{name:'发送成员任务'}))
    await screen.findByText('模拟信箱确认丢失')
    await user.click(screen.getByRole('button',{name:'发送成员任务'}))
    await screen.findByText(/已写入 测试成员 的团队信箱/)
    const sends=call.mock.calls.filter(args=>args[0]==='agents.team.message')
    expect(sends).toHaveLength(2)
    expect(sends[0]?.[1]).toMatchObject({messageId:expect.any(String)})
    const firstSend=sends[0]
    const secondSend=sends[1]
    if(!firstSend||!secondSend)throw new Error('缺少跨智能体消息发送回执')
    expect((firstSend[1] as Record<string,unknown>).messageId).toBe(
      (secondSend[1] as Record<string,unknown>).messageId,
    )
  })

  it('Mission 的其他 SDK 会话进度能在任务板显示，且与当前对话互不混淆',async()=>{
    const user=userEvent.setup()
    render(<App/>)
    await screen.findByText('本地后台已连接')
    await user.click(screen.getByRole('button',{name:'长期任务'}))
    await user.type(screen.getByPlaceholderText('明确长期目标与交付要求…'),'多会话进度核验')
    await user.click(screen.getByRole('button',{name:'创建并选中任务'}))
    await screen.findByRole('heading',{name:'多会话进度核验'})
    await act(async()=>listener({
      event:'mission.activity',missionId:'mission_0123456789abcdef',sessionId:SID,
      jobId:'job_0123456789abcdef',task:{taskId:'agent-1',status:'running',description:'并行检查权限边界'},
    }))
    expect(await screen.findByText('并行检查权限边界')).toBeInTheDocument()
    expect(screen.getByText('多会话智能体实时进度')).toBeInTheDocument()
  })

  it('切换智能体协作模式后发送消息必须启用新SDK会话，旧会话仍保留',async()=>{
    const user=userEvent.setup()
    render(<App/>)
    await screen.findByText('本地后台已连接')
    await user.click(screen.getByRole('button',{name:'AI 对话'}))
    await user.type(screen.getByRole('textbox',{name:'输入任务'}),'第一次分析')
    await user.click(screen.getByRole('button',{name:'发送'}))
    await waitFor(()=>expect(call.mock.calls.filter(args=>args[0]==='smart.execute')).toHaveLength(1))

    await user.click(screen.getByRole('button',{name:'智能体团队'}))
    await user.click(screen.getByRole('button',{name:/Super Agents 团队模式/}))
    await waitFor(()=>expect(call).toHaveBeenCalledWith('agents.setMode',{mode:'super'}))
    await user.click(screen.getByRole('button',{name:'AI 对话'}))
    await waitFor(()=>expect(screen.queryByText('第一次分析')).not.toBeInTheDocument())
    await user.type(screen.getByRole('textbox',{name:'输入任务'}),'第二次分析')
    await user.click(screen.getByRole('button',{name:'发送'}))
    await waitFor(()=>expect(call.mock.calls.filter(args=>args[0]==='smart.execute')).toHaveLength(2))
    expect(call).toHaveBeenCalledWith('smart.execute',expect.objectContaining({prompt:'第二次分析'}))
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
    expect(screen.queryByRole('button',{name:'请求续办任务'})).not.toBeInTheDocument()
    await user.click(screen.getByRole('button',{name:'停止任务'}))
    await waitFor(()=>expect(call).toHaveBeenCalledWith('tasks.stop',{sessionId:SID,taskId:'task-running'}))
  })

  it('中断智能体的续办请求通过原SDK提交并保留真实结果',async()=>{
    const user=userEvent.setup()
    mockTasks=[{taskId:'task-interrupted',description:'未完成的代码审计',status:'interrupted'}]
    render(<App/>)
    await screen.findByText('本地后台已连接')
    await user.click(screen.getByRole('button',{name:'新建会话'}))
    await user.click(screen.getByRole('button',{name:'智能体团队'}))
    await screen.findByText('未完成的代码审计')
    expect(screen.queryByRole('button',{name:'停止任务'})).not.toBeInTheDocument()
    await user.click(screen.getByRole('button',{name:'请求续办任务'}))
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

  it('长对话优先载入最新200条，再从磁盘向前分页到最早消息',async()=>{
    longHistory=true
    const user=userEvent.setup()
    render(<App/>)
    await screen.findByText('本地后台已连接')
    await user.click(screen.getByRole('button',{name:'长历史会话'}))
    await screen.findByText('历史-259')
    expect(screen.queryByText('历史-0')).not.toBeInTheDocument()
    expect(call).toHaveBeenCalledWith('sessions.history',{sessionId:SID,limit:200,offset:0,tail:true})
    await user.click(screen.getByRole('button',{name:/加载更早的 80 条消息/}))
    await user.click(screen.getByRole('button',{name:'从磁盘加载更早的消息'}))
    await screen.findByText('历史-0')
    expect(call).toHaveBeenCalledWith('sessions.history',{sessionId:SID,offset:0,limit:60})
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
    const themeSelect=screen.getByRole('combobox',{name:'界面主题'})
    await user.selectOptions(themeSelect,'ink-blue')
    await waitFor(()=>expect(window.localStorage.getItem('yaoyaoche-desktop:theme')).toBe('ink-blue'))
    await waitFor(()=>expect(window.localStorage.getItem('yaoyaoche-desktop:dark')).toBe('true'))
    await user.click(screen.getByRole('button',{name:'隐藏详情面板'}))
    await waitFor(()=>expect(window.localStorage.getItem('yaoyaoche-desktop:inspector')).toBe('false'))
    instance.unmount()
    render(<App/>)
    await screen.findByText('本地后台已连接')
    expect(document.documentElement.dataset.theme).toBe('ink-blue')
    expect(screen.getByRole('button',{name:'打开详情面板'})).toBeInTheDocument()
  })

  it('乱序恢复 A/B 会话时，A 的迟到历史不得覆盖 B 的消息、模型、权限和阶段',async()=>{
    twoSessions=true
    delayedHistoryId=SID
    const user=userEvent.setup()
    render(<App/>)
    await screen.findByText('本地后台已连接')
    await user.click(screen.getByRole('button',{name:'恢复会话：会话 A'}))
    await waitFor(()=>expect(releaseHistory).toBeTypeOf('function'))
    await user.click(screen.getByRole('button',{name:'恢复会话：会话 B'}))
    await screen.findByText('会话 B 内容')
    expect(screen.getByRole('combobox',{name:'权限模式'})).toHaveValue('plan')
    expect(screen.getByRole('combobox',{name:'当前模型'})).toHaveValue('minimax/M4')
    await act(async()=>releaseHistory?.())
    expect(screen.getByText('会话 B 内容')).toBeInTheDocument()
    expect(screen.queryByText('会话 A 内容')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox',{name:'权限模式'})).toHaveValue('plan')
    expect(screen.getByRole('combobox',{name:'当前模型'})).toHaveValue('minimax/M4')
  })

  it('离线切换工作区时，旧项目尚未返回的会话刷新不得重新写回侧栏',async()=>{
    longHistory=true
    delayedSessionList=true
    pickedOfflineWorkspace=true
    const user=userEvent.setup()
    render(<App/>)
    await screen.findByText('本地后台已连接')
    await waitFor(()=>expect(releaseSessionList).toBeTypeOf('function'))
    await user.click(screen.getByTitle('/projects/example'))
    await screen.findByText('后台未连接')
    await act(async()=>releaseSessionList?.())
    expect(screen.queryByRole('button',{name:'恢复会话：长历史会话'})).not.toBeInTheDocument()
  })

  it('并发宿主请求到达时，正在填写的表单按会话和请求编号独立保留',async()=>{
    const user=userEvent.setup()
    render(<App/>)
    await screen.findByText('本地后台已连接')
    const makeRequest=(id:string,sessionId:string)=>({
      event:'host.request' as const,sessionId,request:{id,request:{
        subtype:'elicitation',mode:'form',title:'补充参数',
        requested_schema:{type:'object',properties:{ticket:{type:'string',title:'工单编号'}}},
      }},
    })
    await act(async()=>{
      listener(makeRequest('form-A',SID))
    })
    const form=await screen.findByRole('dialog',{name:'主机交互请求'})
    await user.type(within(form).getByRole('textbox',{name:'工单编号'}),'pending-A')
    await act(async()=>listener(makeRequest('form-B',OTHER)))
    expect(within(form).getByRole('textbox',{name:'工单编号'})).toHaveValue('pending-A')
    await user.click(within(form).getByRole('button',{name:'提交输入'}))
    await waitFor(()=>expect(call).toHaveBeenCalledWith('host.respond',{
      sessionId:SID,requestId:'form-A',response:{action:'accept',content:{ticket:'pending-A'}},
    }))
    expect(within(screen.getByRole('dialog',{name:'主机交互请求'})).getByRole('textbox',{name:'工单编号'})).toHaveValue('')
  })

  it('工具审批期间禁用新建会话和命令面板快捷键，Tab 焦点保留在审批内',async()=>{
    const user=userEvent.setup()
    render(<App/>)
    await screen.findByText('本地后台已连接')
    await act(async()=>listener({event:'permission.request',sessionId:SID,permission:{
      id:'needs-review',toolName:'Bash',input:{command:'pwd'},
    }}))
    const dialog=screen.getByRole('dialog',{name:'工具权限审批'})
    await user.keyboard('{Control>}k{/Control}')
    await user.keyboard('{Control>}n{/Control}')
    await user.tab()
    expect(dialog.contains(document.activeElement)).toBe(true)
    expect(screen.queryByRole('dialog',{name:'快速操作'})).not.toBeInTheDocument()
    expect(call).not.toHaveBeenCalledWith('sessions.open',expect.anything())
  })

  it('旧文件保存的迟到响应不应改变新文件的已保存内容基准',async()=>{
    manyFiles=true
    delayedSave=true
    const user=userEvent.setup()
    const confirm=vi.spyOn(window,'confirm').mockReturnValue(true)
    try {
      render(<App/>)
      await screen.findByText('本地后台已连接')
      await user.click(screen.getByRole('button',{name:'项目文件'}))
      await user.click(screen.getByRole('button',{name:'刷新文件'}))
      const first=await screen.findByRole('button',{name:/file-0.ts/})
      await user.click(first)
      const editor=await screen.findByRole('textbox',{name:'编辑当前文件'})
      await user.clear(editor)
      await user.type(editor,'待保存 A')
      await user.click(screen.getByRole('button',{name:'保存文件'}))
      await waitFor(()=>expect(releaseSave).toBeTypeOf('function'))
      await user.click(screen.getByRole('button',{name:/file-1.ts/}))
      await waitFor(()=>expect(screen.getByRole('textbox',{name:'编辑当前文件'})).toHaveValue('第二个文件'))
      await act(async()=>releaseSave?.())
      expect(screen.getByRole('textbox',{name:'编辑当前文件'})).toHaveValue('第二个文件')
      expect(screen.getByRole('button',{name:'保存文件'})).toBeDisabled()
    } finally {confirm.mockRestore()}
  })

  it('后台审批请求到达后，迟到的旧权限与宿主列表不会清空待审批队列',async()=>{
    twoSessions=true
    delayedApprovalLists=true
    const user=userEvent.setup()
    render(<App/>)
    await screen.findByText('本地后台已连接')
    await user.click(screen.getByRole('button',{name:'恢复会话：会话 A'}))
    await waitFor(()=>expect(releasePermissionList).toBeTypeOf('function'))
    await waitFor(()=>expect(releaseHostList).toBeTypeOf('function'))
    await act(async()=>{
      listener({event:'permission.request',sessionId:SID,permission:{
        id:'new-approval',toolName:'Bash',input:{command:'pwd'},
      }})
      listener({event:'host.request',sessionId:SID,request:{id:'new-elicitation',request:{
        subtype:'elicitation',mode:'url',url:'https://example.org/consent',
      }}})
    })
    await act(async()=>{
      releasePermissionList?.()
      releaseHostList?.()
    })
    expect(screen.getByRole('dialog',{name:'工具权限审批'})).toHaveTextContent('Bash')
    expect(screen.queryByText(/另有 .* 项待审操作/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button',{name:'允许本次操作'}))
    expect(await screen.findByRole('dialog',{name:'主机交互请求'})).toBeInTheDocument()
  })

})

describe('Super Agents 3.0 身份及交接端到端桌面操作',()=>{
  it('只把已打开的原生会话关联到选定的稳定角色',async()=>{
    showProfileSample=true
    const user=userEvent.setup()
    render(<App/>)
    await screen.findByText('本地后台已连接')
    await user.click(screen.getByRole('button',{name:'新建会话'}))
    await user.click(screen.getByRole('button',{name:'智能体团队'}))
    await screen.findByText('文字研究成员')
    await user.click(screen.getByRole('button',{name:'关联当前会话 · 审校'}))
    await waitFor(()=>expect(call).toHaveBeenCalledWith('agents.profiles.bindSession',{
      agentId:PROFILE_ID,roleId:ROLE_ID,sessionId:SID,
    }))
  })
  it('只有提交真实成果和审核意见后才能调用人工验收接口',async()=>{
    showHandoffReview=true
    const user=userEvent.setup()
    render(<App/>)
    await screen.findByText('本地后台已连接')
    await user.click(screen.getByRole('button',{name:'智能体团队'}))
    await screen.findByText('报告初稿交付验收')
    expect(screen.getByRole('button',{name:'核验后批准'})).toBeDisabled()
    await user.type(screen.getByRole('textbox',{name:'交接验收意见 74f15899'}),'已检查报告来源、结构和实际交付文件，结论通过。')
    await user.click(screen.getByRole('button',{name:'核验后批准'}))
    await waitFor(()=>expect(call).toHaveBeenCalledWith('handoffs.approve',{
      handoffId:HANDOFF_ID,reviewSummary:'已检查报告来源、结构和实际交付文件，结论通过。',
    }))
  })
})
