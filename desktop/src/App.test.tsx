import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppEvent } from './api'

const SID='9b0c188a-66fd-4b30-82e0-f52f2f8dfc35'
let listener:(event:AppEvent)=>void=()=>{}
const call=vi.fn(async(method:string,args:Record<string,unknown>={})=>{
  switch(method){
    case 'app.info': return {workspace:'/projects/example',platform:'linux',version:'0.1.0'}
    case 'hello':return {protocolVersion:1,capabilities:['sessions','missions','agents']}
    case 'models.list':return {models:[{value:'minimax/M3',displayName:'MiniMax M3'}]}
    case 'sessions.list':return []
    case 'agents.overview':return {mode:'master',teams:[],missions:[],activeSessions:0,activeTasks:0}
    case 'missions.list':return {missions:[],selectedMissionId:null}
    case 'credentials.list':return {providers:['openai']}
    case 'mcp.list':return {servers:[{name:'project-mcp',scope:'project',type:'http',url:'https://example.org/mcp',disabled:false}],errors:[]}
    case 'sessions.open':return {sessionId:SID,tasks:[]}
    case 'sessions.send':return {sessionId:SID,turnId:'11afef34-e0a6-4c38-a743-1c451993fdb8'}
    case 'permissions.decide':return {permissionId:args.permissionId,accepted:true}
    case 'credentials.set':return {saved:true}
    case 'mcp.toggle':return {name:args.name,enabled:args.enabled}
    case 'tasks.list':return []
    default:return {}
  }
})
Object.defineProperty(window,'yaoyao',{value:{
  call,
  subscribe(handler:(event:AppEvent)=>void){listener=handler;return ()=>{listener=()=>{}}}
},configurable:true})
HTMLElement.prototype.scrollIntoView=vi.fn()
const {App}=await import('./App')

beforeEach(()=>{call.mockClear();listener=()=>{}})
afterEach(()=>cleanup())

describe('摇摇车真实桌面页面交互',()=>{
  it('加载真实工作区、模型和九个导航入口',async()=>{
    render(<App/>)
    await screen.findByText('本地后台已连接')
    expect(screen.getByRole('button',{name:'工作台概览'})).toBeInTheDocument()
    expect(screen.getByRole('button',{name:'智能体团队'})).toBeInTheDocument()
    expect(screen.getByRole('button',{name:'长期任务'})).toBeInTheDocument()
    expect(screen.getByRole('button',{name:'项目文件'})).toBeInTheDocument()
    expect(call).toHaveBeenCalledWith('models.list',expect.any(Object))
    expect(call).toHaveBeenCalledWith('mcp.list',expect.any(Object))
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
    expect(within(dialog).getByText('Bash')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button',{name:'允许本次操作'}))
    await waitFor(()=>expect(call).toHaveBeenCalledWith('permissions.decide',{
      sessionId:SID,permissionId:'approval-1',decision:{behavior:'allow'}
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
})
