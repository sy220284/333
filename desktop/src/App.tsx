import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Activity, AlertCircle, ArrowRight, Bot, Boxes, Check, ChevronDown, ChevronRight,
  CircleStop, ClipboardList, Cpu, FileCode2, Folder, FolderOpen,
  GitBranch, GitPullRequest, HardDrive, History, LayoutDashboard, ListChecks,
  LockKeyhole, MessageSquare, PanelRightClose,
  PanelRightOpen, Pause, Play, Plus, RefreshCw, Save, Search, Send, Settings2,
  ShieldCheck, Sparkles, SquareTerminal, UsersRound, WandSparkles, X,
  type LucideIcon
} from 'lucide-react'
import { api, type AppEvent, type Item } from './api'
import { asObject, itemFromMessage, statusName, type ConversationItem } from './projection'

type View='dashboard'|'chat'|'agents'|'missions'|'files'|'models'|'integrations'|'github'|'history'|'settings'
type Model={value:string;displayName:string;description?:string}
const PROVIDERS=[{id:'openai',name:'OpenAI API'},{id:'deepseek',name:'DeepSeek'},{id:'qwen',name:'Qwen'},{id:'kimi',name:'Kimi'},{id:'zhipu',name:'智谱 GLM'},{id:'minimax',name:'MiniMax'}] as const
type Mission={id?:string;missionId?:string;objective?:string;status?:string;checkpoint?:string;checkpoints?:unknown[];[key:string]:unknown}
type FileEntry={name:string;path:string;directory:boolean}
type Permission={id:string;sessionId:string;toolName:string;input?:Item;description?:string}
type HostRequest={id:string;sessionId:string;type?:string;request?:unknown;[key:string]:unknown}
type Task={taskId:string;status?:string;description?:string;[key:string]:unknown}
type JobStatus='queued'|'running'|'review'|'completed'|'failed'|'interrupted'|'cancelled'
type MissionJob={id:string;title:string;instruction:string;status:JobStatus;attempt:number;summary?:string;sessionId?:string;history?:Array<{attempt:number;status:string;summary:string;finishedAt:string;sessionId?:string}>}
type TeamMember={agentId:string;name:string;agentType?:string;model?:string;status:'running'|'idle'|'unknown'}
type McpServer={name:string;scope:string;type:string;disabled:boolean;url?:string}
const NAV:{id:View;label:string;icon:LucideIcon}[]=[
  {id:'dashboard',label:'工作台概览',icon:LayoutDashboard},
  {id:'chat',label:'AI 对话',icon:MessageSquare},
  {id:'agents',label:'智能体团队',icon:UsersRound},
  {id:'missions',label:'长期任务',icon:ClipboardList},
  {id:'files',label:'项目文件',icon:FolderOpen},
  {id:'models',label:'模型管理',icon:Cpu},
  {id:'integrations',label:'技能与 MCP',icon:Boxes},
  {id:'github',label:'GitHub',icon:GitPullRequest},
  {id:'history',label:'历史记录',icon:History},
  {id:'settings',label:'设置与权限',icon:Settings2}
]
const TITLES:Record<View,[string,string]>={
  dashboard:['工作台概览','从这里继续你的 AI 工作，让每项进展都清晰可见。'],
  chat:['AI 对话','在同一个工作区里进行推理、工具执行和协作。'],
  agents:['智能体团队','管理主子智能体与 Super Agents 团队协作。'],
  missions:['长期任务','保存目标、记录检查点，按授权恢复执行。'],
  files:['项目文件','浏览和编辑项目文件，检查真实 Git 差异。'],
  models:['模型管理','查看后端实际发现的模型和当前会话配置。'],
  integrations:['技能与 MCP','通过 AI 工具链使用和检查已配置的集成能力。'],
  github:['GitHub','查看工作区 Git 状态并发起代码审查任务。'],
  history:['历史记录','恢复当前工作区保存在本地的会话。'],
  settings:['设置与权限','控制执行模式、工具授权和工作台偏好。']
}
function dateTime(ts:number){return new Date(ts).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}
function obj(v:unknown):Item{return asObject(v)??{}}
function presentError(v:unknown){return v instanceof Error?v.message:String(v)}
function missionId(m:Mission){return String(m.missionId||m.id||'')}
function json(v:unknown){try{return JSON.stringify(v,null,2)}catch{return String(v)}}
function IconButton({label,onClick,children,disabled=false}:{
  label:string;onClick:()=>void;children:ReactNode;disabled?:boolean
}){return <button aria-label={label} title={label} type="button" className="icon-button" onClick={onClick} disabled={disabled}>{children}</button>}
function Empty({icon:Icon,title,detail,action}:{
  icon:LucideIcon;title:string;detail:string;action?:ReactNode
}){return <div className="empty-state"><div className="empty-icon"><Icon size={28}/></div><h3>{title}</h3><p>{detail}</p>{action}</div>}
function Section({title,subtitle,action,children}:{
  title:string;subtitle?:string;action?:ReactNode;children:ReactNode
}){return <section className="section"><div className="section-heading"><div><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div>{action}</div>{children}</section>}
function StatusTag({text,tone='neutral'}:{text:string;tone?:'good'|'warn'|'neutral'|'danger'}){return <span className={`status-tag ${tone}`}><span className="status-dot"/>{text}</span>}
function Panel({children,className=''}:{children:ReactNode;className?:string}){return <div className={`panel ${className}`}>{children}</div>}
export function App(){
  const [view,setView]=useState<View>('dashboard')
  const [workspace,setWorkspace]=useState('')
  const [connected,setConnected]=useState(false)
  const [error,setError]=useState('')
  const [busy,setBusy]=useState('')
  const [sessionId,setSessionId]=useState('')
  const [sessionPhase,setSessionPhase]=useState('idle')
  const [historyOnly,setHistoryOnly]=useState(false)
  const [sessions,setSessions]=useState<Item[]>([])
  const [models,setModels]=useState<Model[]>([])
  const [selectedModel,setSelectedModel]=useState('')
  const [savedProviders,setSavedProviders]=useState<string[]>([])
  const [credentialProvider,setCredentialProvider]=useState('openai')
  const [credentialInput,setCredentialInput]=useState('')
  const [mcpServers,setMcpServers]=useState<McpServer[]>([])
  const [mcpErrors,setMcpErrors]=useState<string[]>([])
  const [mcpName,setMcpName]=useState('')
  const [mcpType,setMcpType]=useState<'http'|'sse'|'stdio'>('http')
  const [mcpTarget,setMcpTarget]=useState('')
  const [mcpArguments,setMcpArguments]=useState('')
  const [mcpScope,setMcpScope]=useState<'project'|'user'|'local'>('project')
  const [messages,setMessages]=useState<ConversationItem[]>([])
  const [draft,setDraft]=useState('')
  const [mode,setMode]=useState<'master'|'super'>('master')
  const [overview,setOverview]=useState<Item>({})
  const [selectedTeam,setSelectedTeam]=useState('')
  const [teamMembers,setTeamMembers]=useState<TeamMember[]>([])
  const [missions,setMissions]=useState<Mission[]>([])
  const [selectedMission,setSelectedMission]=useState('')
  const [missionDraft,setMissionDraft]=useState('')
  const [checkpointDraft,setCheckpointDraft]=useState('')
  const [missionJobs,setMissionJobs]=useState<MissionJob[]>([])
  const [missionQueueActive,setMissionQueueActive]=useState(false)
  const [jobTitle,setJobTitle]=useState('')
  const [jobInstruction,setJobInstruction]=useState('')
  const [tasks,setTasks]=useState<Task[]>([])
  const [permissions,setPermissions]=useState<Permission[]>([])
  const [hostRequests,setHostRequests]=useState<HostRequest[]>([])
  const [hostForm,setHostForm]=useState<Record<string,unknown>>({})
  const [rightOpen,setRightOpen]=useState(true)
  const [search,setSearch]=useState('')
  const [files,setFiles]=useState<FileEntry[]>([])
  const [folder,setFolder]=useState('')
  const [currentFile,setCurrentFile]=useState('')
  const [fileContent,setFileContent]=useState('')
  const [savedContent,setSavedContent]=useState('')
  const [gitStatus,setGitStatus]=useState('')
  const [gitDiff,setGitDiff]=useState('')
  const [isDark,setIsDark]=useState(true)
  const [animate,setAnimate]=useState(true)
  const [permissionMode,setPermissionMode]=useState('default')
  const [activity,setActivity]=useState<string[]>([])
  const inputRef=useRef<HTMLTextAreaElement>(null)
  const messagesEnd=useRef<HTMLDivElement>(null)
  const sessionRef=useRef('')
  const createSessionRef=useRef<()=>Promise<void>>(async()=>{})
  const selectedMissionRef=useRef('')
  const viewRef=useRef<View>('dashboard')

  useEffect(()=>{viewRef.current=view},[view])
  useEffect(()=>{sessionRef.current=sessionId},[sessionId])
  useEffect(()=>{selectedMissionRef.current=selectedMission},[selectedMission])
  const invoke=useCallback(async<T,>(method:string,args:Record<string,unknown>={}):Promise<T>=>{
    setError('')
    try{return await api.call<T>(method,args)}
    catch(e){const reason=presentError(e);setError(reason);throw e}
  },[])
  const refresh=useCallback(async()=>{
    const queries=await Promise.allSettled([
      api.call<{models:Model[]}>('models.list'),
      api.call<Item[]>('sessions.list',{limit:50,offset:0}),
      api.call<Item>('agents.overview'),
      api.call<{missions:Mission[];selectedMissionId:string|null}>('missions.list'),
      api.call<{providers:string[]}>('credentials.list'),
      api.call<{servers:McpServer[];errors:string[]}>('mcp.list')
    ])
    if(queries[0].status==='fulfilled')setModels(queries[0].value.models??[])
    if(queries[1].status==='fulfilled')setSessions(Array.isArray(queries[1].value)?queries[1].value:[])
    if(queries[2].status==='fulfilled'){
      setOverview(queries[2].value)
      setMode(queries[2].value.mode==='super'?'super':'master')
    }
    if(queries[3].status==='fulfilled'){
      setMissions(queries[3].value.missions??[])
      setSelectedMission(queries[3].value.selectedMissionId??'')
    }
    if(queries[4].status==='fulfilled')setSavedProviders(queries[4].value.providers??[])
    if(queries[5].status==='fulfilled'){
      setMcpServers(queries[5].value.servers??[])
      setMcpErrors(queries[5].value.errors??[])
    }
    const names=['模型列表','历史会话','智能体概览','长期任务','模型凭证','MCP服务']
    const failed=queries.flatMap((item,index)=>item.status==='rejected'
      ? [`${names[index]}：${presentError(item.reason)}`] : [])
    if(failed.length)setError(`刷新部分失败：${failed.join('；')}`)
  },[])
  const refreshSession=useCallback(async(id:string)=>{
    const [p,h,t]=await Promise.allSettled([
      api.call<Permission[]>('permissions.list',{sessionId:id}),
      api.call<HostRequest[]>('host.list',{sessionId:id}),
      api.call<Task[]>('tasks.list',{sessionId:id})
    ])
    if(p.status==='fulfilled')setPermissions(old=>[
      ...old.filter(item=>item.sessionId!==id),
      ...(p.value??[]).map(item=>({...item,sessionId:id}))
    ])
    if(h.status==='fulfilled')setHostRequests(old=>[
      ...old.filter(item=>item.sessionId!==id),
      ...(h.value??[]).map(item=>({...item,sessionId:id}))
    ])
    if(t.status==='fulfilled')setTasks(t.value??[])
    const names=['权限请求','宿主请求','后台任务']
    const failed=[p,h,t].flatMap((item,index)=>item.status==='rejected'
      ? [`${names[index]}：${presentError(item.reason)}`] : [])
    if(failed.length)setError(`会话信息刷新失败：${failed.join('；')}`)
  },[])
  useEffect(()=>{
    let alive=true
    const unsub=api.subscribe((event:AppEvent)=>{
      if(!alive)return
      if(event.event==='desktop.disconnected'){
        setConnected(false);setError(String(event.error||'桌面后台连接已断开'));return
      }
      const globalInbox=['permission.request','permission.resolved','host.request','host.resolved']
      if(event.sessionId&&event.sessionId!==sessionRef.current&&!globalInbox.includes(event.event))return
      if(event.event==='session.state'){
        const state=obj(event.state)
        setSessionPhase(String(state.phase??state.status??'idle'))
      }else if(event.event==='session.error'||event.event==='task.persistence.error'){
        setError(String(event.error||'任务执行异常'))
      }else if(event.event==='permission.request'){
        const p={...obj(event.permission),sessionId:String(event.sessionId||'')} as Permission
        setPermissions(old=>old.some(item=>item.id===p.id)?old:[...old,p])
      }else if(event.event==='permission.resolved'){
        setPermissions(old=>old.filter(item=>item.id!==event.permissionId||item.sessionId!==event.sessionId))
      }else if(event.event==='host.request'){
        const r={...obj(event.request),sessionId:String(event.sessionId||'')} as HostRequest
        setHostForm({})
        setHostRequests(old=>old.some(item=>item.id===r.id)?old:[...old,r])
      }else if(event.event==='host.resolved'){
        setHostRequests(old=>old.filter(item=>item.id!==event.requestId||item.sessionId!==event.sessionId))
      }else if(event.event==='mission.queue.state'){
        if(String(event.missionId||'')!==selectedMissionRef.current)return
        setMissionQueueActive(Boolean(event.active))
        const queueMessage=event.message
        if(typeof queueMessage==='string')setActivity(old=>[queueMessage,...old.filter(item=>item!==queueMessage)].slice(0,20))
      }else if(event.event==='mission.job.updated'&&event.job){
        if(String(event.missionId||'')!==selectedMissionRef.current)return
        const updated=obj(event.job) as unknown as MissionJob
        setMissionJobs(old=>[updated,...old.filter(job=>job.id!==updated.id)])
      }else if(event.event==='task.updated'&&event.task){
        const task=obj(event.task) as unknown as Task
        setTasks(old=>[task,...old.filter(t=>t.taskId!==task.taskId)])
      }else if(event.event==='session.message'){
        const payload=obj(event.message)
        if(payload.type==='stream_event'){
          const streaming=obj(payload.event)
          const delta=obj(streaming.delta)
          if(streaming.type==='content_block_delta'&&delta.type==='text_delta'&&typeof delta.text==='string'){
            const turnId=`stream-${String(event.turnId)}`
            setMessages(old=>{
              const at=old.findIndex(item=>item.id===turnId)
              const next={id:turnId,kind:'assistant' as const,text:(at<0?'':old[at].text)+delta.text,time:Date.now()}
              return at<0?[...old,next]:old.map((item,i)=>i===at?next:item)
            })
          }
        }else{
          const item=itemFromMessage(payload)
          if(item&&item.kind!=='user'){
            setMessages(old=>{
              const id=item.id
              const has=old.some(m=>m.id===id)
              const streamIndex=old.findIndex(m=>m.id===`stream-${String(event.turnId)}`)
              if(item.kind==='assistant'&&streamIndex>=0){
                return old.map((m,i)=>i===streamIndex?{...item,id:m.id}:m)
              }
              return has?old.map(m=>m.id===id?item:m):[...old,item]
            })
          }
        }
      }else if(event.event==='agent.progress'){
        const e=obj(event.message);setActivity(old=>[String(e.type||'agent.progress'),...old.filter(item=>item!==String(e.type||'agent.progress'))].slice(0,20))
      }
    })
    void (async()=>{
      try{
        const info=await api.call<{workspace:string}>('app.info')
        if(!alive)return
        setWorkspace(info.workspace);setFolder(info.workspace)
        await api.call('hello')
        if(!alive)return
        setConnected(true);await refresh()
      }catch(e){if(alive){setConnected(false);setError(presentError(e))}}
    })()
    return ()=>{alive=false;unsub()}
  },[refresh])
  useEffect(()=>{
    const available=Array.isArray(overview.teams)?overview.teams as Item[]:[]
    if(!available.some(team=>String(team.name||'')===selectedTeam))
      setSelectedTeam(available.length?String(available[0].name||''):'')
  },[overview,selectedTeam])
  useEffect(()=>{
    if(!selectedTeam||!workspace){setTeamMembers([]);return}
    let live=true
    api.call<TeamMember[]>('agents.members',{teamName:selectedTeam})
      .then(members=>{if(live)setTeamMembers(members)})
      .catch(reason=>{if(live)setError(presentError(reason))})
    return()=>{live=false}
  },[selectedTeam,workspace])
  useEffect(()=>{if(view==='chat'&&messages.length>0)messagesEnd.current?.scrollIntoView({behavior:'smooth',block:'end'})},[messages,view])
  useEffect(()=>{
    let valid=true
    if(!selectedMission){setMissionJobs([]);return}
    api.call<MissionJob[]>('missions.jobs.list',{missionId:selectedMission})
      .then(jobs=>{if(valid)setMissionJobs(jobs)})
      .catch(err=>{if(valid)setError(presentError(err))})
    api.call<{active:boolean}>('missions.jobs.queueStatus',{missionId:selectedMission})
      .then(state=>{if(valid)setMissionQueueActive(state.active)})
      .catch(err=>{if(valid)setError(presentError(err))})
    return ()=>{valid=false}
  },[selectedMission])
  useEffect(()=>{document.documentElement.dataset.theme=isDark?'dark':'light'},[isDark])
  useEffect(()=>{document.documentElement.dataset.motion=animate?'on':'off'},[animate])
  useEffect(()=>{
    const onKey=(event:KeyboardEvent)=>{
      const mod=event.ctrlKey||event.metaKey
      if(mod&&event.key.toLowerCase()==='k'){event.preventDefault();document.getElementById('global-search')?.focus()}
      if(mod&&event.key.toLowerCase()==='n'){event.preventDefault();void createSessionRef.current()}
      if(event.key==='Escape')setSearch('')
    }
    window.addEventListener('keydown',onKey)
    return ()=>window.removeEventListener('keydown',onKey)
  },[])
  async function operation(name:string,action:()=>Promise<unknown>){
    setBusy(name)
    try{await action()}catch(error){setError(presentError(error))}finally{setBusy('')}
  }
  async function createSession(){
    await operation('新建会话',async()=>{
      const response=await invoke<{sessionId:string;models?:Model[];tasks?:Task[]}>('sessions.open',selectedModel?{model:selectedModel}:{})
      setSessionId(response.sessionId);sessionRef.current=response.sessionId;setSessionPhase('idle');setHistoryOnly(false);setMessages([])
      setTasks(response.tasks??[])
      setView('chat');await refresh()
    })
  }
  async function resumeSession(id:string){
    await operation('恢复会话',async()=>{
      const response=await invoke<{sessionId:string;tasks?:Task[]}>('sessions.ensureOpen',{sessionId:id})
      setSessionId(response.sessionId);sessionRef.current=response.sessionId;setHistoryOnly(false);setTasks(response.tasks??[])
      const history=await invoke<unknown>('sessions.history',{sessionId:id,limit:200,offset:0})
      const rows=Array.isArray(history)?history:asObject(history)?.messages??[]
      const next=(Array.isArray(rows)?rows:[]).map((item,index)=>itemFromMessage(item,index)).filter(Boolean) as ConversationItem[]
      setMessages(next);setView('chat');await refreshSession(id)
    })
  }
  async function send(){
    const text=draft.trim()
    if(!text||busy)return
    if(!sessionId){
      await operation('创建会话',async()=>{
        const response=await invoke<{sessionId:string}>('sessions.open',selectedModel?{model:selectedModel}:{})
        setSessionId(response.sessionId);sessionRef.current=response.sessionId;setSessionPhase('idle');setHistoryOnly(false);setMessages([])
        await invoke('sessions.send',{sessionId:response.sessionId,message:text})
        setMessages([{id:`local-${Date.now()}`,kind:'user',text,time:Date.now()}])
        setDraft('');setView('chat')
      })
    }else{
      await operation('发送消息',async()=>{
        if(historyOnly){
          const opened=await invoke<{sessionId:string;tasks?:Task[]}>('sessions.ensureOpen',{sessionId})
          setTasks(opened.tasks??[])
          setHistoryOnly(false)
          await refreshSession(sessionId)
        }
        await invoke('sessions.send',{sessionId,message:text})
        setMessages(old=>[...old,{id:`local-${Date.now()}`,kind:'user',text,time:Date.now()}])
        setDraft('')
      })
    }
  }
  async function selectWorkspace(){
    await operation('切换工作区',async()=>{
      const data=await invoke<{workspace:string;changed:boolean;connected?:boolean;error?:string}>('workspace.pick')
      if(!data.changed)return
      setWorkspace(data.workspace);setFolder(data.workspace);setSessionId('');sessionRef.current='';setHistoryOnly(false);setMessages([])
      setPermissions([]);setHostRequests([]);setTasks([]);setFiles([])
      setCurrentFile('');setGitStatus('');setGitDiff('')
      setConnected(Boolean(data.connected))
      if(data.error)setError(data.error)
      if(data.connected)await refresh()
    })
  }
  async function directory(path:string){
    await operation('读取目录',async()=>{
      const data=await invoke<{path:string;entries:FileEntry[]}>('workspace.list',{path})
      setFolder(data.path);setFiles(data.entries??[])
    })
  }
  async function openFile(path:string){
    await operation('读取文件',async()=>{
      const data=await invoke<{path:string;content:string}>('workspace.read',{path})
      setCurrentFile(data.path);setFileContent(data.content);setSavedContent(data.content)
    })
  }
  async function saveFile(){
    if(!currentFile||fileContent===savedContent)return
    await operation('保存文件',async()=>{
      const response=await invoke<{saved:boolean}>('workspace.write',{path:currentFile,content:fileContent})
      if(response.saved)setSavedContent(fileContent)
    })
  }
  async function refreshGit(){
    await operation('读取 Git',async()=>{
      const [s,d]=await Promise.all([
        invoke<{text:string}>('workspace.gitStatus'),
        invoke<{text:string}>('workspace.gitDiff')
      ])
      setGitStatus(s.text);setGitDiff(d.text)
    })
  }
  async function agentMode(next:'master'|'super'){
    if(next===mode)return
    await operation('切换智能体模式',async()=>{
      await invoke('agents.setMode',{mode:next})
      // SDK workers are separate OS processes. Changing the host preference
      // cannot change the already running worker's Coordinator Mode. A new
      // conversation must be opened for the new mode; the old transcript and
      // executing tasks remain available in history.
      if(sessionRef.current){
        setSessionId('');sessionRef.current=''
        setHistoryOnly(false);setMessages([]);setTasks([]);setSessionPhase('idle')
        setPermissionMode('default')
        setActivity(old=>['已切换协作模式；发送下一条消息会新建会话，原会话与执行历史仍保留。',...old].slice(0,20))
      }
      setMode(next);await refresh()
    })
  }
  async function createMission(){
    if(!missionDraft.trim())return
    await operation('创建长期任务',async()=>{
      const mission=await invoke<Mission>('missions.create',{objective:missionDraft.trim()})
      setMissionDraft('');setSelectedMission(missionId(mission))
      await refresh()
    })
  }
  async function missionAction(id:string,status:'active'|'paused'|'completed'){
    await operation('更新任务',async()=>{await invoke('missions.updateStatus',{missionId:id,status});await refresh()})
  }
  async function refreshJobs(id=selectedMission){
    if(!id)return
    const jobs=await invoke<MissionJob[]>('missions.jobs.list',{missionId:id})
    if(id===selectedMissionRef.current)setMissionJobs(jobs)
  }
  async function addJob(){
    if(!selectedMission||!jobTitle.trim()||!jobInstruction.trim())return
    await operation('添加工作项',async()=>{
      await invoke('missions.jobs.enqueue',{missionId:selectedMission,title:jobTitle.trim(),instruction:jobInstruction.trim()})
      setJobTitle('');setJobInstruction('');await refreshJobs()
    })
  }
  async function jobAction(method:string,jobId:string){
    if(!selectedMission)return
    if(method==='missions.jobs.approve' && !window.confirm('已核对代码、实际结果与测试记录，确认此工作项通过审核？'))return
    if(method==='missions.jobs.retry' && !window.confirm('重新执行前请先核对已产生的文件改动及外部操作。确认重新排队？'))return
    if(method==='missions.jobs.cancel' && !window.confirm('确认取消工作项并保留执行历史？'))return
    await operation('工作项执行',async()=>{
      const result=await invoke<unknown>(method,{missionId:selectedMission,jobId})
      const info=obj(result)
      if(method==='missions.jobs.start'&&typeof info.sessionId==='string'){
        setSessionId(info.sessionId);sessionRef.current=info.sessionId;setHistoryOnly(false)
      }
      await refreshJobs()
      await refresh()
    })
  }
  async function viewJobSession(job:MissionJob){
    if(!job.sessionId)return
    await operation('查看执行记录',async()=>{
      const history=await invoke<unknown>('sessions.history',{sessionId:job.sessionId,limit:200,offset:0})
      const rows=Array.isArray(history)?history:asObject(history)?.messages??[]
      setMessages((Array.isArray(rows)?rows:[]).map((item,index)=>itemFromMessage(item,index)).filter(Boolean) as ConversationItem[])
      const restoredSessionId=job.sessionId
      if(!restoredSessionId)throw new Error('当前工作项没有可恢复的会话记录')
      setSessionId(restoredSessionId);sessionRef.current=restoredSessionId
      // Historical views must not start a worker; sending explicitly resumes.
      setHistoryOnly(true)
      setTasks([])
      setSessionPhase('idle')
      setView('chat')
    })
  }
  async function runMissionQueue(){
    if(!selectedMission||!window.confirm('本次授权会在当前桌面宿主内持续推进已排队的工作，最多同时执行三项；退出桌面或点击停止会结束新任务派发。是否开始？'))return
    await operation('持续推进工作队列',async()=>{
      await invoke('missions.jobs.runQueue',{missionId:selectedMission})
      setMissionQueueActive(true);await refreshJobs()
    })
  }
  async function haltMissionQueue(){
    if(!selectedMission)return
    await operation('停止工作队列',async()=>{
      await invoke('missions.jobs.haltQueue',{missionId:selectedMission})
      setMissionQueueActive(false)
    })
  }
  async function batchJobs(){
    if(!selectedMission)return
    await operation('并行执行工作项',async()=>{
      const result=await invoke<{launched:{ok:boolean;error?:string}[];remaining:number}>('missions.jobs.runBatch',{missionId:selectedMission,limit:3})
      await refreshJobs()
      const failed=result.launched.filter(item=>!item.ok)
      if(failed.length)throw new Error(failed.map(item=>item.error||'执行失败').join('；'))
    })
  }
  async function installMcp(){
    if(!mcpName.trim()||!mcpTarget.trim())return
    await operation('添加 MCP 服务',async()=>{
      const config=mcpType==='stdio'
        ?{type:'stdio',command:mcpTarget.trim(),args:mcpArguments.split('\n').map(x=>x.trim()).filter(Boolean)}
        :{type:mcpType,url:mcpTarget.trim()}
      const result=await invoke<{added?:boolean;cancelled?:boolean}>('mcp.add',{name:mcpName.trim(),scope:mcpScope,config})
      if(result.added){setMcpName('');setMcpTarget('');setMcpArguments('');await refresh()}
    })
  }
  async function manageMcp(server:McpServer,method:'mcp.remove'|'mcp.toggle'){
    await operation('管理 MCP 服务',async()=>{
      const params=method==='mcp.remove'?{name:server.name,scope:server.scope}:{name:server.name,enabled:server.disabled}
      const result=await invoke<{cancelled?:boolean}>(method,params)
      if(!result.cancelled)await refresh()
    })
  }
  async function saveCredential(){
    if(!credentialInput.trim())return
    await operation('保存模型密钥',async()=>{
      const result=await invoke<{saved:boolean}>('credentials.set',{provider:credentialProvider,key:credentialInput.trim()})
      if(result.saved){setCredentialInput('');await refresh()}
    })
  }
  async function removeCredential(){
    await operation('移除模型密钥',async()=>{
      const result=await invoke<{removed:boolean}>('credentials.remove',{provider:credentialProvider})
      if(result.removed)await refresh()
    })
  }
  async function checkpoint(){
    if(!selectedMission||!checkpointDraft.trim())return
    await operation('记录检查点',async()=>{
      await invoke('missions.checkpoint',{missionId:selectedMission,checkpoint:checkpointDraft.trim()})
      setCheckpointDraft('');await refresh()
    })
  }
  async function decision(id:string,allow:boolean){
    await operation('权限审批',async()=>{
      const pending=permissions.find(item=>item.id===id)
      if(!pending?.sessionId)throw new Error('审批请求已过期，请刷新会话')
      await invoke('permissions.decide',{sessionId:pending.sessionId,permissionId:id,
        decision:allow?{behavior:'allow'}:{behavior:'deny',message:'用户已在桌面端拒绝该工具调用'}})
      setPermissions(old=>old.filter(p=>p.id!==id||p.sessionId!==pending.sessionId))
    })
  }
  async function respondHost(id:string,action:'accept'|'decline'){
    await operation('主机请求',async()=>{
      const pending=hostRequests.find(request=>request.id===id)
      if(!pending?.sessionId)throw new Error('主机请求已过期，请刷新会话')
      await invoke('host.respond',{sessionId:pending.sessionId,requestId:id,response:action==='accept'&&obj(pending.request).mode!=='url'?{action,content:hostForm}:{action}})
      setHostRequests(old=>old.filter(r=>r.id!==id||r.sessionId!==pending.sessionId));setHostForm({})
    })
  }
  const requested=hostRequests[0]
  const requestedDetails=obj(requested?.request)
  const requestedSchema=obj(requestedDetails.requested_schema)
  const requestedProperties=obj(requestedSchema.properties)
  const selected=missions.find(m=>missionId(m)===selectedMission)
  const filteredNav=useMemo(()=>NAV.filter(n=>n.label.includes(search.trim())),[search])
  function toChat(prompt:string){setDraft(prompt);setView('chat');requestAnimationFrame(()=>inputRef.current?.focus())}
  createSessionRef.current=createSession
  const heading=TITLES[view]
    return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Sparkles size={21}/></div><div><strong>摇摇车</strong><small>AGENT WORKSPACE</small></div></div>
      <button type="button" className="workspace-picker" onClick={selectWorkspace} title={workspace||'选择工作区'}>
        <div className="workspace-icon"><HardDrive size={17}/></div><div className="workspace-details"><strong>{workspace.split(/[\\/]/).filter(Boolean).at(-1)||'选择工作区'}</strong><small>{workspace?'本地工作区':'选择本地项目'}</small></div><ChevronDown size={14}/>
      </button>
      <div className="sidebar-top-label">工作区导航</div>
      <nav className="nav-links" aria-label="主要导航">{filteredNav.map(({id,label,icon:Icon})=><button type="button" key={id} className={`nav-item ${view===id?'active':''}`} onClick={()=>setView(id)}><Icon size={17} strokeWidth={1.75}/><span>{label}</span>{id==='settings'&&permissions.length>0&&<b className="nav-counter">{permissions.length}</b>}</button>)}</nav>
      <div className="sidebar-footer">
        <div className="connection-line"><span className={`connection-light ${connected?'online':'offline'}`}/><span>{connected?'本地后台已连接':'后台未连接'}</span></div>
        <span className="muted tiny">摇摇车 Desktop · 本地运行</span>
      </div>
    </aside>
    <div className="workspace-body">
      <header className="topbar"><div className="breadcrumbs"><span>工作区</span><ChevronRight size={14}/><strong>{heading[0]}</strong></div><div className="topbar-actions">
        <div className="searchbar"><Search size={15}/><input id="global-search" placeholder="搜索导航 · ⌘K" value={search} onChange={e=>setSearch(e.target.value)}/></div>
        <IconButton label="刷新数据" onClick={()=>void operation('刷新',refresh)}><RefreshCw size={17}/></IconButton>
        <IconButton label={rightOpen?'隐藏详情面板':'打开详情面板'} onClick={()=>setRightOpen(v=>!v)}>{rightOpen?<PanelRightClose size={17}/>:<PanelRightOpen size={17}/>}</IconButton>
      </div></header>
      <div className="content-region">
        <main className="main-content" key={view}>
          <div className="page-header"><div><span className="eyebrow">YAOYAO / WORKSPACE</span><h1>{heading[0]}</h1><p>{heading[1]}</p></div><div className="header-action">{view==='dashboard'||view==='chat'?<button type="button" className="primary-button" onClick={()=>void createSession()} disabled={Boolean(busy)}><Plus size={16}/>新建会话</button>:null}</div></div>
          {error&&<div className="error-banner" role="alert"><AlertCircle size={17}/><span>{error}</span><IconButton label="关闭错误" onClick={()=>setError('')}><X size={16}/></IconButton></div>}
          {!connected&&<div className="offline-banner"><AlertCircle size={19}/><div><strong>本地执行引擎尚未连接</strong><p>请确认桌面 Host 已构建并可启动，或选择有效工作区。页面保留可访问，执行操作需要后台连接。</p></div><button type="button" className="secondary-button" onClick={()=>void operation('重连',async()=>{await invoke('hello');setConnected(true);await refresh()})}>重新连接</button></div>}
          {view==='dashboard'&&<div className="dashboard-page">
            <div className="welcome-gradient"><span className="eyebrow">GOOD TO SEE YOU AGAIN</span><h2>让想法持续向前。</h2><p>从一次对话出发，组织智能体、工具与长期任务，把复杂工作变得有条理。</p><div className="welcome-actions"><button type="button" onClick={()=>void createSession()} className="primary-button"><Plus size={16}/>开始新任务</button><button type="button" onClick={()=>setView('missions')} className="ghost-button">查看任务中心<ArrowRight size={16}/></button></div><div className="hero-orb"><Bot size={86} strokeWidth={1}/></div></div>
            <div className="dashboard-stats"><Panel><div className="stat-icon blue"><MessageSquare/></div><span className="stat-label">历史会话</span><strong>{sessions.length}</strong></Panel><Panel><div className="stat-icon purple"><UsersRound/></div><span className="stat-label">协作模式</span><strong>{mode==='super'?'Super':'主子智能体'}</strong></Panel><Panel><div className="stat-icon mint"><ClipboardList/></div><span className="stat-label">长期任务</span><strong>{missions.length}</strong></Panel><Panel><div className="stat-icon amber"><Cpu/></div><span className="stat-label">可用模型</span><strong>{models.length}</strong></Panel></div>
            <Section title="继续工作" action={<button type="button" className="text-button" onClick={()=>setView('history')}>全部会话<ArrowRight size={15}/></button>}>
              {sessions.length===0?<Empty icon={MessageSquare} title="开始第一段对话" detail="选择模型并创建会话，AI 执行进度将同步到工作台。" action={<button type="button" className="secondary-button" onClick={()=>void createSession()}>创建会话</button>}/>:<div className="item-list">{sessions.slice(0,5).map((s,i)=><button type="button" key={String(s.sessionId||s.id||i)} className="list-row" onClick={()=>void resumeSession(String(s.sessionId||s.id||''))}><div className="row-icon"><MessageSquare size={18}/></div><div className="row-main"><strong>{String(s.summary||s.title||s.sessionId||'历史会话')}</strong><span>点击恢复会话</span></div><ChevronRight size={17}/></button>)}</div>}
            </Section>
            <div className="two-columns"><Section title="长期任务" action={<button type="button" className="text-button" onClick={()=>setView('missions')}>管理任务<ArrowRight size={15}/></button>}><Panel className="mini-panel">{missions.length?missions.slice(0,3).map(m=><button type="button" className="compact-row" key={missionId(m)} onClick={()=>{setSelectedMission(missionId(m));setView('missions')}}><ListChecks size={17}/><span>{m.objective||'未命名任务'}</span><StatusTag text={String(m.status||'active')}/></button>):<Empty icon={ClipboardList} title="暂时没有长期任务" detail="创建目标后可记录检查点并随时恢复。" />}</Panel></Section>
            <Section title="快捷入口"><Panel className="quick-links">{[['智能体团队',UsersRound,'agents'],['文件与 Git',Folder,'files'],['模型选择',Cpu,'models'],['技能与连接',Boxes,'integrations']].map(([label,Icon,id])=>{const I=Icon as LucideIcon;return <button type="button" key={String(id)} onClick={()=>setView(id as View)}><I size={20}/><span>{String(label)}</span><ArrowRight size={15}/></button>})}</Panel></Section></div>
          </div>}
          {view==='chat'&&<div className="chat-page">
            <div className="chat-toolbar"><div className="toolbar-left"><StatusTag text={historyOnly?'历史记录':statusName(sessionPhase)} tone={sessionPhase==='running'?'warn':'good'}/>{sessionId&&<span className="session-id" title={sessionId}>会话 {sessionId.slice(0,8)}</span>}</div><div className="toolbar-right"><select aria-label="当前模型" disabled={historyOnly} value={selectedModel} onChange={e=>{setSelectedModel(e.target.value);if(sessionId)void operation('切换模型',()=>invoke('sessions.setModel',{sessionId,model:e.target.value}))}}><option value="">默认模型</option>{models.map(m=><option value={m.value} key={m.value}>{m.displayName||m.value}</option>)}</select><select aria-label="权限模式" disabled={historyOnly} value={permissionMode} onChange={e=>{const next=e.target.value;void operation('修改权限模式',async()=>{if(!sessionId)throw new Error('请先创建会话');await invoke('sessions.setPermissionMode',{sessionId,mode:next});setPermissionMode(next)})}}><option value="default">默认权限</option><option value="acceptEdits">允许编辑</option><option value="plan">规划模式</option><option value="dontAsk">拒绝后继续</option><option value="bypassPermissions">跳过确认（危险）</option></select>{sessionId&&!historyOnly&&<IconButton label="停止当前执行" onClick={()=>void operation('中断执行',()=>invoke('sessions.interrupt',{sessionId}))}><CircleStop size={18}/></IconButton>}</div></div>
            <div className="message-stream">{messages.length===0?<div className="chat-empty"><div className="chat-empty-icon"><Sparkles size={38}/></div><h2>今天想完成什么？</h2><p>分析项目、编写代码、管理任务，或者邀请智能体协作。</p><div className="prompt-suggestions">{['分析当前工作区的项目结构','检查 PR19 最新代码问题','规划一个多智能体协作任务'].map(t=><button type="button" key={t} onClick={()=>setDraft(t)}>{t}<ArrowRight size={14}/></button>)}</div></div>:messages.map(m=><div className={`message ${m.kind}`} key={m.id}><div className="message-avatar">{m.kind==='user'?<span>我</span>:m.kind==='assistant'?<Sparkles size={17}/>:<SquareTerminal size={16}/>}</div><div className="message-content"><div className="message-meta">{m.kind==='user'?'你':m.kind==='assistant'?'摇摇车':'工具'}<time>{dateTime(m.time)}</time></div><div className="message-text">{m.text}</div></div></div>)}<div ref={messagesEnd}/></div>
            {permissions.length>0&&<div className="inline-approval"><ShieldCheck size={18}/><span>{permissions.length} 项工具操作等待批准</span><button type="button" onClick={()=>setView('settings')}>查看审批<ArrowRight size={14}/></button></div>}
            {historyOnly&&<div className="inline-approval"><History size={18}/><span>当前正在查看历史执行记录。发送新消息时将恢复原会话。</span></div>}
            <div className="composer"><textarea ref={inputRef} aria-label="输入任务" value={draft} onChange={e=>setDraft(e.target.value)} placeholder="描述任务，支持使用文字引用项目文件与技能…" onKeyDown={e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();void send()}}}/><div className="composer-footer"><div className="composer-hints"><span><Bot size={15}/> {mode==='super'?'Super Agents':'主子智能体'}</span><span>⌘ / Ctrl + Enter 发送</span></div><button type="button" className="primary-button send-button" disabled={!draft.trim()||Boolean(busy)||!connected} onClick={()=>void send()}><Send size={16}/>发送</button></div></div>
          </div>}
          {view==='agents'&&<div className="stack-page"><Section title="协作模式" subtitle="模式切换在新会话生效；已有会话及执行历史保留。仅在明确发起任务时运行智能体。"><div className="mode-cards"><button type="button" className={`mode-card ${mode==='master'?'selected':''}`} onClick={()=>void agentMode('master')}><div className="mode-icon"><Bot size={26}/></div><div><strong>主智能体 + 子智能体</strong><p>主智能体负责规划与汇总，子智能体并行执行独立工作。</p></div><span>{mode==='master'?<Check size={18}/>:<ArrowRight size={18}/>}</span></button><button type="button" className={`mode-card ${mode==='super'?'selected':''}`} onClick={()=>void agentMode('super')}><div className="mode-icon"><UsersRound size={27}/></div><div><strong>Super Agents 团队模式</strong><p>面向共享任务、团队通信、任务簿和长期目标协同。</p></div><span>{mode==='super'?<Check size={18}/>:<ArrowRight size={18}/>}</span></button></div></Section>
            <Section title="项目团队" subtitle="直接读取当前项目真实存在的团队和成员；跨会话团队可统一查看。" action={<button type="button" className="secondary-button" onClick={()=>void operation('刷新团队',refresh)}><RefreshCw size={15}/>刷新</button>}>
              {Array.isArray(overview.teams)&&overview.teams.length>0?
                <div className="team-directory">
                  <div className="team-picker">{(overview.teams as Item[]).map(team=>{
                    const name=String(team.name||'')
                    return <button type="button" key={name} className={`team-option ${selectedTeam===name?'selected':''}`} onClick={()=>setSelectedTeam(name)}>
                      <UsersRound size={18}/><strong>{name}</strong>
                      <span>成员 {Number(team.memberCount||0)} · 执行中 {Number(team.runningCount||0)}</span>
                    </button>
                  })}</div>
                  <Panel className="team-roster">
                    <div className="detail-heading"><h3>{selectedTeam||'选择团队'}</h3><StatusTag text={`已发现 ${teamMembers.length} 位成员`} tone="neutral"/></div>
                    <div className="team-member-list">{teamMembers.length?teamMembers.map(member=><div className="team-member" key={member.agentId}>
                      <div className="row-icon"><Bot size={18}/></div>
                      <div className="row-main"><strong>{member.name}</strong><span>{member.agentType||'通用智能体'} · {member.model||'默认模型'}</span></div>
                      <StatusTag text={member.status==='running'?'执行中':member.status==='idle'?'空闲':'状态未知'} tone={member.status==='running'?'good':'neutral'}/>
                    </div>):<Empty icon={UsersRound} title="当前团队没有活动成员" detail="团队成员创建后会显示真实角色和状态；无需额外启动占位智能体。"/>}</div>
                  </Panel>
                </div>:
                <Empty icon={UsersRound} title="当前项目暂无团队" detail="切换到 Super Agents 模式后，可按任务需要在会话中创建真实团队。"/>}
            </Section>
            <Section title="智能体任务" action={<button type="button" className="text-button" onClick={()=>setView('chat')}>进入对话<ArrowRight size={15}/></button>}><Panel className="mini-panel">{tasks.length?tasks.map(t=><div className="compact-row" key={t.taskId}><Activity size={16}/><span>{String(t.description||t.taskId)}</span><StatusTag text={String(t.status||'未知')}/>{sessionId&&t.status==='running'&&<IconButton label="停止任务" onClick={()=>void operation('停止任务',async()=>{await invoke('tasks.stop',{sessionId,taskId:t.taskId});await refreshSession(sessionId)})}><CircleStop size={15}/></IconButton>}{sessionId&&['interrupted','failed','stopped'].includes(String(t.status))&&<IconButton label="继续任务" onClick={()=>void operation('恢复任务',async()=>{await invoke('tasks.resume',{sessionId,taskId:t.taskId,prompt:'先核对已有执行结果与文件改动，再继续尚未完成的工作并提供测试证据'});await refreshSession(sessionId)})}><Play size={15}/></IconButton>}</div>):<Empty icon={UsersRound} title="尚无运行中的智能体任务" detail="在对话中发起协作后，这里会出现真实任务进度。"/>}</Panel></Section></div>}
          {view==='missions'&&<div className="mission-page"><div className="mission-list-column"><Panel><h3>创建长期任务</h3><textarea value={missionDraft} onChange={e=>setMissionDraft(e.target.value)} rows={3} placeholder="明确长期目标与交付要求…"/><button type="button" className="primary-button full-width" onClick={()=>void createMission()} disabled={!missionDraft.trim()||Boolean(busy)}><Plus size={15}/>创建并选中任务</button></Panel><Section title="任务簿" action={<button type="button" className="text-button" onClick={()=>void operation('刷新任务簿',refresh)}><RefreshCw size={15}/></button>}><div className="mission-list">{missions.map(m=><button type="button" key={missionId(m)} className={`mission-item ${selectedMission===missionId(m)?'selected':''}`} onClick={()=>{setSelectedMission(missionId(m));void operation('选择任务',()=>invoke('missions.select',{missionId:missionId(m)}))}}><strong>{m.objective||'未命名任务'}</strong><StatusTag text={m.status==='paused'?'已暂停':m.status==='completed'?'已完成':'执行中'} tone={m.status==='paused'?'warn':'good'}/></button>)}{missions.length===0&&<Empty icon={ClipboardList} title="任务簿为空" detail="创建长期任务后，可保存进度、暂停与恢复。"/>}</div></Section></div><div className="mission-detail"><Panel>{selected?<><div className="detail-heading"><h2>任务详情</h2><StatusTag text={selected.status||'active'} tone={selected.status==='paused'?'warn':'good'}/></div><h3 className="mission-objective">{selected.objective}</h3><p className="muted">任务 ID：{missionId(selected)}</p><div className="button-row"><button type="button" className="secondary-button" onClick={()=>void missionAction(missionId(selected),'active')}><Play size={15}/>恢复</button><button type="button" className="secondary-button" onClick={()=>void missionAction(missionId(selected),'paused')}><Pause size={15}/>暂停</button><button type="button" className="secondary-button" onClick={()=>void missionAction(missionId(selected),'completed')}><Check size={15}/>完成</button></div><div className="divider"/><h3>Super Agents 工作项</h3><p className="muted">工作项先登记在本地任务簿，只有点击执行才会启动智能体。最多并发三项，结果需要人工审查。</p><div className="job-form"><input aria-label="工作项标题" placeholder="工作项标题" value={jobTitle} onChange={e=>setJobTitle(e.target.value)}/><textarea aria-label="工作项执行指令" rows={3} placeholder="给智能体的完整执行要求和验收条件" value={jobInstruction} onChange={e=>setJobInstruction(e.target.value)}/><button type="button" className="secondary-button" onClick={()=>void addJob()} disabled={!jobTitle.trim()||!jobInstruction.trim()||Boolean(busy)}><Plus size={15}/>添加工作项</button></div><div className="job-list">{missionJobs.map(job=><div className="job-card" key={job.id}><div className="job-head"><strong>{job.title}</strong><StatusTag text={{queued:'排队中',running:'执行中',review:'待审核',completed:'已完成',failed:'执行失败',interrupted:'已中断',cancelled:'已取消'}[job.status]||job.status} tone={job.status==='completed'?'good':job.status==='review'||job.status==='running'?'warn':job.status==='failed'||job.status==='interrupted'?'danger':'neutral'}/></div><p>{job.instruction}</p>{job.summary&&<div className="job-summary">{job.summary}</div>}<div className="job-meta">执行次数：{job.attempt}{job.history?.length?` · 保留 ${job.history.length} 次执行记录`:''}</div>{job.history?.length?<details className="job-history"><summary>查看历史执行详情</summary>{job.history.map(record=><div className="job-attempt" key={`${record.attempt}-${record.finishedAt}`}><strong>第 {record.attempt} 次 · {record.status}</strong><span>{new Date(record.finishedAt).toLocaleString('zh-CN')}</span><p>{record.summary}</p></div>)}</details>:null}<div className="job-actions">{job.status==='queued'&&<button type="button" onClick={()=>void jobAction('missions.jobs.start',job.id)} className="secondary-button small"><Play size={14}/>执行</button>}{job.sessionId&&<button type="button" onClick={()=>void viewJobSession(job)} className="secondary-button small"><MessageSquare size={14}/>查看会话</button>}{job.status==='review'&&<button type="button" onClick={()=>void jobAction('missions.jobs.approve',job.id)} className="primary-button small"><Check size={14}/>审核通过</button>}{(job.status==='failed'||job.status==='interrupted')&&<button type="button" onClick={()=>void jobAction('missions.jobs.retry',job.id)} className="secondary-button small"><RefreshCw size={14}/>重新排队</button>}{job.status==='running'&&<button type="button" onClick={()=>void jobAction('missions.jobs.recover',job.id)} className="secondary-button small"><History size={14}/>检查中断</button>}{job.status==='running'&&job.sessionId&&<button type="button" onClick={()=>void operation('中断工作项',async()=>{await invoke('sessions.interrupt',{sessionId:job.sessionId});await refreshJobs()})} className="secondary-button small"><CircleStop size={14}/>中断</button>}{job.status==='review'&&<button type="button" onClick={()=>void jobAction('missions.jobs.retry',job.id)} className="secondary-button small"><RefreshCw size={14}/>重新执行</button>}{(job.status==='queued'||job.status==='review'||job.status==='failed'||job.status==='interrupted')&&<button type="button" onClick={()=>void jobAction('missions.jobs.cancel',job.id)} className="secondary-button small"><X size={14}/>取消</button>}</div></div>)}{missionJobs.length===0&&<p className="muted small">暂时没有工作项，添加后可按需开始。</p>}</div><div className="button-row"><button type="button" className="secondary-button" onClick={()=>void operation('刷新工作项',()=>refreshJobs())}><RefreshCw size={15}/>刷新</button><button type="button" className="primary-button" onClick={()=>void batchJobs()} disabled={!missionJobs.some(job=>job.status==='queued')||Boolean(busy)}><UsersRound size={15}/>并行执行待办（最多三项）</button>{missionQueueActive?
  <button type="button" className="secondary-button" onClick={()=>void haltMissionQueue()} disabled={Boolean(busy)}><Pause size={15}/>停止自动派发</button>:
  <button type="button" className="secondary-button" onClick={()=>void runMissionQueue()} disabled={!missionJobs.some(job=>job.status==='queued')||Boolean(busy)||selected.status!=='active'}><Play size={15}/>持续推进队列</button>}</div><div className="divider"/><h3>保存检查点</h3><textarea rows={4} placeholder="填写已验证进度、修改和下一步工作…" value={checkpointDraft} onChange={e=>setCheckpointDraft(e.target.value)}/><button type="button" className="primary-button" disabled={!checkpointDraft.trim()||Boolean(busy)} onClick={()=>void checkpoint()}><Save size={15}/>记录进度</button><div className="divider"/><h3>已有检查点</h3><div className="checkpoint-list">{selected.checkpoint?<div className="checkpoint"><Check size={15}/><pre>{selected.checkpoint}</pre></div>:Array.isArray(selected.checkpoints)&&selected.checkpoints.length?selected.checkpoints.map(c=><div key={typeof c==='string'?c:json(c)} className="checkpoint"><Check size={15}/><pre>{typeof c==='string'?c:json(c)}</pre></div>):<p className="muted">尚无检查点记录</p>}</div></>:<Empty icon={ListChecks} title="选择一项长期任务" detail="查看目标，记录进度，并控制任务状态。"/>}</Panel></div></div>}
          {view==='files'&&<div className="files-page"><div className="file-explorer"><div className="pane-title"><FolderOpen size={17}/>项目目录<IconButton label="刷新文件" onClick={()=>void directory(folder||workspace)}><RefreshCw size={15}/></IconButton></div><button type="button" className="folder-path" onClick={()=>void directory(workspace)} title={workspace}><HardDrive size={14}/>{workspace.split(/[\\/]/).filter(Boolean).at(-1)||'工作区'}</button>{folder!==workspace&&<button type="button" className="explorer-up" onClick={()=>void directory(folder.replace(/[\\/][^\\/]+$/,''))}>.. 上一级目录</button>}<div className="explorer-list">{files.map(f=><button type="button" key={f.path} className={`file-entry ${currentFile===f.path?'selected':''}`} onClick={()=>void (f.directory?directory(f.path):openFile(f.path))}>{f.directory?<Folder size={16}/>:<FileCode2 size={16}/>}<span>{f.name}</span></button>)}{files.length===0&&<div className="subtle-empty">选择刷新以加载文件列表</div>}</div></div><div className="file-workspace"><div className="file-tabs"><span>{currentFile?currentFile.split(/[\\/]/).at(-1):'文件预览'}</span>{currentFile&&<button type="button" className="secondary-button small" disabled={fileContent===savedContent} onClick={()=>void saveFile()}><Save size={14}/>保存文件</button>}</div>{currentFile?<textarea className="code-editor" spellCheck={false} aria-label="编辑当前文件" value={fileContent} onChange={e=>setFileContent(e.target.value)}/>:<Empty icon={FileCode2} title="选择文件开始预览" detail="点击左侧文件，查看并编辑。保存前会弹出系统确认。"/>}<div className="git-panel"><div className="pane-title"><GitBranch size={16}/>工作区差异<button type="button" className="text-button" onClick={()=>void refreshGit()}><RefreshCw size={14}/>刷新 Git</button></div><pre>{gitDiff||gitStatus||'此处显示真实 Git 状态与工作区改动。'}</pre></div></div></div>}
          {view==='models'&&<div className="stack-page"><Section title="发现的模型" subtitle="模型目录由真实桌面后台返回，选择后应用到当前会话。" action={<button type="button" className="secondary-button" onClick={()=>void operation('刷新模型',refresh)}><RefreshCw size={15}/>重新检测</button>}><div className="model-grid">{models.map(m=><button type="button" key={m.value} className={`model-card ${selectedModel===m.value?'selected':''}`} onClick={()=>{setSelectedModel(m.value);if(sessionId)void operation('切换模型',()=>invoke('sessions.setModel',{sessionId,model:m.value}))}}><div className="model-symbol"><Cpu size={22}/></div><strong>{m.displayName||m.value}</strong><small>{m.value}</small><p>{m.description||'由已配置的模型服务商提供'}</p>{selectedModel===m.value&&<div className="selected-model"><Check size={14}/>当前选择</div>}</button>)}</div>{models.length===0&&<Empty icon={Cpu} title="尚未发现可用模型" detail="请检查模型服务商配置和桌面后台连接；模型将从 SDK 实际能力目录加载。"/>}</Section><Section title="服务商凭证" subtitle="直接使用现有本地密钥管理服务。只展示是否已保存，绝不回显密钥内容。"><Panel><div className="credentials-layout"><div className="provider-list">{PROVIDERS.map(p=><button type="button" key={p.id} className={`provider-item ${credentialProvider===p.id?'selected':''}`} onClick={()=>{setCredentialProvider(p.id);setCredentialInput('')}}><Cpu size={17}/><span>{p.name}</span><StatusTag text={savedProviders.includes(p.id)?'已配置':'未配置'} tone={savedProviders.includes(p.id)?'good':'neutral'}/></button>)}</div><div className="credential-form"><h3>{PROVIDERS.find(p=>p.id===credentialProvider)?.name}</h3><p>填入该服务商的 API Key。保存前会弹出系统确认，凭证仅存储在本机。</p><label htmlFor="provider-key">API Key</label><input id="provider-key" type="password" autoComplete="off" placeholder="输入新的 API Key" value={credentialInput} onChange={e=>setCredentialInput(e.target.value)}/><div className="button-row"><button type="button" className="primary-button" onClick={()=>void saveCredential()} disabled={!credentialInput.trim()||Boolean(busy)}><Save size={15}/>保存凭证</button><button type="button" className="secondary-button" onClick={()=>void removeCredential()} disabled={!savedProviders.includes(credentialProvider)||Boolean(busy)}>移除已保存密钥</button></div><p className="muted small">ChatGPT OAuth 使用独立授权流程；模型能力与上下文窗口由后台模型目录发现。</p></div></div></Panel></Section><Panel className="info-panel"><ShieldCheck size={18}/><div><strong>模型参数由后端统一管理</strong><p>服务商、上下文窗口、工具调用和推理档位以 PR19 模型配置为准，避免桌面端形成第二份失效配置。</p></div><button type="button" className="text-button" onClick={()=>toChat('检查当前配置的模型、服务商参数与上下文窗口，并列出需要修正的项')}>检查配置<ArrowRight size={15}/></button></Panel></div>}
          {view==='integrations'&&<div className="stack-page"><div className="integration-grid"><Panel><div className="integration-icon purple"><WandSparkles size={26}/></div><h2>技能 Skills</h2><p>复用项目和用户级技能，为重复工作提供标准执行路径。</p><button type="button" className="secondary-button" onClick={()=>toChat('列出当前工作区可用的全部技能，包括来源、功能、启用状态和使用方式')}><Search size={15}/>检查已安装技能</button></Panel><Panel><div className="integration-icon blue"><Boxes size={26}/></div><h2>MCP 工具</h2><p>让 AI 使用项目服务、外部工具与本地开发能力。</p><button type="button" className="secondary-button" onClick={()=>toChat('检查当前 MCP 服务器连接情况，列出服务、工具、授权和连接错误')}><Activity size={15}/>检查 MCP 连接</button></Panel><Panel><div className="integration-icon mint"><Bot size={26}/></div><h2>插件与扩展</h2><p>保持现有插件运行机制，按需读取能力与诊断问题。</p><button type="button" className="secondary-button" onClick={()=>toChat('审计当前已安装的插件及其功能入口，检查是否能够正常调用')}><ArrowRight size={15}/>检查插件</button></Panel></div><Section title="MCP 服务器管理" subtitle="复用 PR19 的 MCP 配置、范围和企业策略，显示实际已登记的服务器。" action={<button type="button" className="secondary-button" onClick={()=>void operation('刷新 MCP',refresh)}><RefreshCw size={15}/>刷新</button>}><Panel><div className="mcp-list">{mcpServers.map(server=><div className="mcp-row" key={`${server.scope}:${server.name}`}><div className="mcp-info"><div><strong>{server.name}</strong><StatusTag text={server.disabled?'已禁用':'已启用'} tone={server.disabled?'warn':'good'}/></div><p>{server.scope} · {server.type}{server.url?` · ${server.url}`:''}</p></div><button type="button" className="secondary-button small" onClick={()=>void manageMcp(server,'mcp.toggle')}>{server.disabled?'启用':'禁用'}</button><button type="button" className="secondary-button small" onClick={()=>void manageMcp(server,'mcp.remove')}><X size={14}/>移除</button></div>)}{mcpServers.length===0&&<p className="muted small">当前工作区尚无已登记的 MCP 服务。</p>}{mcpErrors.map(e=><p className="mcp-error" key={e}><AlertCircle size={14}/>{e}</p>)}</div><div className="divider"/><h3>添加 MCP 服务</h3><div className="mcp-form"><label>名称<input placeholder="例如 github-mcp" value={mcpName} onChange={e=>setMcpName(e.target.value)}/></label><label>连接方式<select value={mcpType} onChange={e=>setMcpType(e.target.value as typeof mcpType)}><option value="http">HTTP</option><option value="sse">SSE</option><option value="stdio">本地命令（stdio）</option></select></label><label>配置范围<select value={mcpScope} onChange={e=>setMcpScope(e.target.value as typeof mcpScope)}><option value="project">当前项目</option><option value="user">用户级</option><option value="local">本地项目级</option></select></label><label className="mcp-wide">{mcpType==='stdio'?'启动命令':'服务器 URL'}<input placeholder={mcpType==='stdio'?'例如 npx':'https://mcp.example.com/mcp'} value={mcpTarget} onChange={e=>setMcpTarget(e.target.value)}/></label>{mcpType==='stdio'&&<label className="mcp-wide">命令参数（每行一项）<textarea rows={3} value={mcpArguments} onChange={e=>setMcpArguments(e.target.value)} placeholder={"-y\n@example/server"}/></label>}<button type="button" className="primary-button" onClick={()=>void installMcp()} disabled={!mcpName.trim()||!mcpTarget.trim()||Boolean(busy)}><Plus size={15}/>添加服务</button></div></Panel></Section><Panel className="info-panel"><AlertCircle size={18}/><div><strong>插件与技能继续使用既有执行引擎</strong><p>上方 MCP 已支持添加、禁用、恢复、删除及范围管理。插件市场安装和技能管理的独立桌面页面仍需复用原有插件服务接口接通。</p></div></Panel></div>}
          {view==='github'&&<div className="stack-page"><Panel className="github-hero"><div className="github-badge"><GitPullRequest size={27}/></div><div><h2>项目 Git 工作区</h2><p>{workspace}</p><StatusTag text="本地仓库" tone="good"/></div><button type="button" className="secondary-button" onClick={()=>void refreshGit()}><RefreshCw size={15}/>刷新状态</button></Panel><div className="two-columns"><Section title="工作区状态"><Panel><pre className="git-output">{gitStatus||'点击「刷新状态」获取当前仓库真实状态。'}</pre></Panel></Section><Section title="智能代码审查"><Panel><p className="muted">使用仓库现有 GitHub 工具、PR 审查规则及权限体系执行任务。</p><button type="button" className="primary-button" onClick={()=>toChat('审查当前 Git 工作区和 PR19 的最新修改，按风险等级列出问题并附上代码位置')}><GitPullRequest size={16}/>发起 PR 审查</button></Panel></Section></div><Section title="未提交改动"><Panel><pre className="git-output">{gitDiff||'刷新后在这里查看 Git diff。'}</pre></Panel></Section></div>}
          {view==='history'&&<div className="stack-page"><Section title="本地会话" action={<button type="button" className="secondary-button" onClick={()=>void operation('刷新历史',refresh)}><RefreshCw size={15}/>刷新</button>}><Panel><div className="item-list">{sessions.map((s,i)=>{const id=String(s.sessionId||s.id||'');return <button type="button" key={id||i} className="list-row" onClick={()=>void resumeSession(id)} disabled={!id}><div className="row-icon"><History size={17}/></div><div className="row-main"><strong>{String(s.summary||s.title||id||'会话')}</strong><span>{id}</span></div><span className="muted">恢复</span><ChevronRight size={17}/></button>})}{sessions.length===0&&<Empty icon={History} title="没有历史会话" detail="会话历史由后台按工作区保存，运行过的会话可从这里恢复。"/>}</div></Panel></Section></div>}
          {view==='settings'&&<div className="stack-page"><Section title="工具权限审批" subtitle="每一项工具执行请求都需要明确处理。拒绝会直接反馈给执行引擎。"><Panel>{permissions.length===0?<Empty icon={ShieldCheck} title="当前没有待处理的审批" detail="AI 发起受保护的工具操作时，申请会出现在这里。"/>:<div className="approval-list">{permissions.map(p=><div key={p.id} className="approval-card"><div className="approval-title"><LockKeyhole size={18}/><div><strong>{p.toolName}</strong><span>{p.description||'工具请求等待确认'} · 会话 {p.sessionId.slice(0,8)}</span></div></div><pre>{json(p.input)}</pre><div className="button-row"><button type="button" className="secondary-button" onClick={()=>void decision(p.id,false)}>拒绝</button><button type="button" className="primary-button" onClick={()=>void decision(p.id,true)}>本次允许</button></div></div>)}</div>}</Panel></Section>
            <Section title="主机交互请求"><Panel>{hostRequests.length===0?<p className="muted">没有需要处理的主机交互请求。</p>:hostRequests.map(r=><div key={r.id} className="approval-card"><strong>{String(r.type||'交互请求')}</strong><pre>{json(r.request||r)}</pre><button type="button" className="secondary-button" onClick={()=>void operation('拒绝请求',async()=>{await invoke('host.reject',{sessionId:r.sessionId,requestId:r.id,reason:'用户在桌面端拒绝请求'});await refreshSession(r.sessionId)})}>拒绝请求</button></div>)}</Panel></Section>
            <Section title="外观与体验"><Panel className="settings-list"><label className="setting-row"><div><strong>深色主题</strong><p>深色背景与柔和分层玻璃质感</p></div><input type="checkbox" checked={isDark} onChange={e=>setIsDark(e.target.checked)}/></label><label className="setting-row"><div><strong>动态效果</strong><p>开启过渡与悬停动效，系统要求减少动态效果时自动降低</p></div><input type="checkbox" checked={animate} onChange={e=>setAnimate(e.target.checked)}/></label><div className="setting-row"><div><strong>侧边上下文面板</strong><p>显示任务、模型、审批和运行摘要</p></div><button type="button" className="secondary-button" onClick={()=>setRightOpen(v=>!v)}>{rightOpen?'收起面板':'展开面板'}</button></div></Panel></Section></div>}
        </main>
        {rightOpen&&<aside className="inspector"><div className="inspector-heading"><span>实时上下文</span><IconButton label="收起详情" onClick={()=>setRightOpen(false)}><X size={15}/></IconButton></div><div className="inspector-content"><div className="inspector-section"><span className="side-section-label">运行状态</span><div className="runtime-tile"><div className={`runtime-indicator ${connected?'ok':'off'}`}>{connected?<Activity size={20}/>:<AlertCircle size={20}/>}</div><strong>{connected?'引擎已连接':'等待连接'}</strong><span>{statusName(sessionPhase)}</span></div></div><div className="inspector-section"><span className="side-section-label">当前配置</span><div className="detail-row"><span>智能体模式</span><strong>{mode==='super'?'Super Agents':'主子模式'}</strong></div><div className="detail-row"><span>当前模型</span><strong title={selectedModel}>{selectedModel||'默认模型'}</strong></div><div className="detail-row"><span>待审权限</span><strong className={permissions.length?'attention':''}>{permissions.length} 项</strong></div><div className="detail-row"><span>活动任务</span><strong>{tasks.length}</strong></div></div><div className="inspector-section"><span className="side-section-label">快捷操作</span><button type="button" className="inspector-action" onClick={()=>setView('settings')}><ShieldCheck size={16}/>管理权限<ChevronRight size={15}/></button><button type="button" className="inspector-action" onClick={()=>setView('missions')}><ListChecks size={16}/>任务簿<ChevronRight size={15}/></button><button type="button" className="inspector-action" onClick={()=>setView('models')}><Cpu size={16}/>模型选择<ChevronRight size={15}/></button></div><div className="inspector-section"><span className="side-section-label">最近活动</span>{activity.length?activity.slice(0,6).map(event=><div className="activity-entry" key={event}><span className="activity-dot"/>{event}</div>):<p className="muted small">运行任务时，这里显示执行活动。</p>}</div></div><div className="inspector-footer"><span className={`connection-light ${connected?'online':'offline'}`}/><span>本地工作区 · {busy||'已就绪'}</span></div></aside>}
      </div>
      {permissions.length>0&&<div className="modal-backdrop" role="presentation"><div className="approval-modal" role="dialog" aria-modal="true" aria-label="工具权限审批"><div className="modal-heading"><div className="modal-icon"><ShieldCheck size={23}/></div><div><span className="eyebrow">PERMISSION REQUEST</span><h2>需要确认工具操作</h2></div></div><p className="muted">摇摇车希望执行以下操作。请检查内容后明确选择。</p><div className="approval-target"><strong>{permissions[0].toolName} · 会话 {permissions[0].sessionId.slice(0,8)}</strong><pre>{json(permissions[0].input)}</pre></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={()=>void decision(permissions[0].id,false)} disabled={Boolean(busy)}>拒绝</button><button type="button" className="primary-button" onClick={()=>void decision(permissions[0].id,true)} disabled={Boolean(busy)}>允许本次操作</button></div>{permissions.length>1&&<span className="modal-count">另有 {permissions.length-1} 项待审操作</span>}</div></div>}
      {permissions.length===0&&requested&&<div className="modal-backdrop"><div className="approval-modal" role="dialog" aria-modal="true" aria-label="主机交互请求"><div className="modal-heading"><div className="modal-icon"><LockKeyhole size={23}/></div><div><span className="eyebrow">HOST REQUEST</span><h2>{String(requestedDetails.title||'需要您的输入')}</h2></div></div><p className="muted">{String(requestedDetails.message||requestedDetails.description||'后台请求用户处理交互内容。')}</p>{requestedDetails.subtype==='elicitation'&&requestedDetails.mode==='url'?<>
        <div className="approval-target">
          <strong>来自 {String(requestedDetails.mcp_server_name||'MCP')} 的链接请求</strong>
          <pre>{String(requestedDetails.url||'未提供链接')}</pre>
        </div>
        <p className="muted">确认网站来源后，在系统浏览器中访问。完成操作后选择“已完成”，或拒绝此请求。</p>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={()=>void respondHost(requested.id,'decline')} disabled={Boolean(busy)}>拒绝访问</button>
          <button type="button" className="secondary-button" disabled={Boolean(busy)||!String(requestedDetails.url||'').startsWith('https://')} onClick={()=>void operation('打开 MCP 链接',async()=>{
            const result=await invoke<{opened:boolean}>('external.open',{url:String(requestedDetails.url||'')})
            if(!result.opened)throw new Error('已取消在浏览器中打开链接')
          })}>在浏览器中打开</button>
          <button type="button" className="primary-button" onClick={()=>void respondHost(requested.id,'accept')} disabled={Boolean(busy)}>已完成，继续</button>
        </div>
      </>:requestedDetails.subtype==='elicitation'?<><div className="host-fields">{Object.entries(requestedProperties).map(([key,value])=>{const field=obj(value);const valueType=String(field.type||'string');return <label key={key} htmlFor={`host-field-${key}`}><span>{String(field.title||key)}{Array.isArray(requestedSchema.required)&&requestedSchema.required.includes(key)?' *':''}</span>{Array.isArray(field.enum)?<select id={`host-field-${key}`} value={String(hostForm[key]??'')} onChange={e=>setHostForm(old=>({...old,[key]:e.target.value}))}><option value="">请选择</option>{field.enum.map((item:unknown)=><option key={String(item)} value={String(item)}>{String(item)}</option>)}</select>:valueType==='boolean'?<input id={`host-field-${key}`} type="checkbox" checked={Boolean(hostForm[key])} onChange={e=>setHostForm(old=>({...old,[key]:e.target.checked}))}/>:<input id={`host-field-${key}`} type={valueType==='number'||valueType==='integer'?'number':'text'} value={String(hostForm[key]??'')} onChange={e=>setHostForm(old=>({...old,[key]:valueType==='number'||valueType==='integer'?Number(e.target.value):e.target.value}))}/>}</label>})}</div><div className="modal-actions"><button type="button" className="secondary-button" onClick={()=>void respondHost(requested.id,'decline')}>拒绝</button><button type="button" className="primary-button" onClick={()=>void respondHost(requested.id,'accept')}>提交输入</button></div></>:<div className="modal-actions"><button type="button" className="secondary-button" onClick={()=>void operation('取消主机请求',async()=>{await invoke('host.reject',{sessionId:requested.sessionId,requestId:requested.id,reason:'桌面端未支持该主机交互类型'});setHostRequests(old=>old.filter(r=>r.id!==requested.id||r.sessionId!==requested.sessionId))})}>取消此请求</button></div>}</div></div>}
      <footer className="statusbar"><span><span className={`connection-light ${connected?'online':'offline'}`}/>{connected?'本地连接正常':'后端不可用'}</span><span>{workspace||'未选择项目'}</span><span className="statusbar-right">{sessionId?`会话 ${sessionId.slice(0,8)} · `:''}{statusName(sessionPhase)}</span></footer>
    </div>
  </div>
}
