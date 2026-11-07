import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Activity, AlertCircle, ArrowRight, Bot, Boxes, Check, ChevronDown, ChevronRight,
  CircleStop, ClipboardList, Code2, Cpu, FileCode2, Folder, FolderOpen,
  GitBranch, GitPullRequest, HardDrive, History, LayoutDashboard, ListChecks,
  LockKeyhole, MessageSquare, PanelRightClose,
  PanelRightOpen, Pause, Play, Plus, RefreshCw, Save, Search, Settings2,
  ShieldCheck, SquareTerminal, UsersRound, WandSparkles, X,
  type LucideIcon
} from 'lucide-react'
import { api, type AppEvent, type Item } from './api'
import { NewSessionStarter } from './components/layout/NewSessionStarter'
import { WorkspaceInspector } from './components/layout/WorkspaceInspector'
import { LocalMaintenance } from './components/layout/LocalMaintenance'
import { McpImportPanel } from './components/layout/McpImportPanel'
import { SessionChatSurface } from './components/chat/SessionChatSurface'
import { Badge } from './components/ui/Badge'
import { Button } from './components/ui/Button'
import { Card } from './components/ui/Card'
import { EmptyState } from './components/ui/EmptyState'
import { Modal } from './components/ui/Modal'
import { asObject, itemFromMessage, statusName, type ConversationItem } from './projection'

type View='dashboard'|'chat'|'agents'|'missions'|'files'|'models'|'integrations'|'github'|'history'|'settings'
type ThemeVariant='white'|'paper'|'warm-classic'|'celadon'|'dark'|'ink-blue'
const THEME_VARIANTS:readonly ThemeVariant[]=['white','paper','warm-classic','celadon','dark','ink-blue']
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
type SmartRecord={sessionId:string;model:string;permissionMode:string;budgetUsd?:number;costUsd?:number;status:'running'|'completed'|'failed'|'interrupted';startedAt:string;finishedAt?:string}
type SmartInspection={model:string;status:string;message:string;checkedOffline:boolean;contextWindow?:number|null;maxOutputTokens?:number|null;outputSource?:string;toolRoundTrip?:boolean|null}
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
const NAV_GROUPS:{label:string;views:View[]}[]=[
  {label:'工作',views:['dashboard','chat','history']},
  {label:'智能体与任务',views:['agents','missions']},
  {label:'开发工作区',views:['files','github']},
  {label:'扩展与设置',views:['models','integrations','settings']},
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
const PREF='yaoyaoche-desktop:'
function loadPreference(name:string,fallback:boolean){const value=window.localStorage.getItem(PREF+name);return value===null?fallback:value==='true'}
function obj(v:unknown):Item{return asObject(v)??{}}
function presentError(v:unknown){return v instanceof Error?v.message:String(v)}
function missionId(m:Mission){return String(m.missionId||m.id||'')}
function json(v:unknown){try{return JSON.stringify(v,null,2)}catch{return String(v)}}

function IconButton({label,onClick,children,disabled=false}:{label:string;onClick:()=>void;children:ReactNode;disabled?:boolean}){
  return <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] focus-visible:outline-2 focus-visible:outline-[var(--color-brand)] disabled:opacity-40">{children}</button>
}
function Empty({icon:Icon,title,detail,action}:{icon:LucideIcon;title:string;detail:string;action?:ReactNode}){
  return <EmptyState icon={<Icon size={24}/>} title={title} description={detail} variant="plain" size="lg">{action}</EmptyState>
}
function Section({title,subtitle,action,children}:{title:string;subtitle?:string;action?:ReactNode;children:ReactNode}){
  return <section className="section"><div className="section-heading"><div><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div>{action}</div>{children}</section>
}
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
  const [mcpEnvironment,setMcpEnvironment]=useState('')
  const [mcpScope,setMcpScope]=useState<'project'|'user'|'local'>('project')
  const [messages,setMessages]=useState<ConversationItem[]>([])
  const [visibleMessageCount,setVisibleMessageCount]=useState(120)
  const [followLatest,setFollowLatest]=useState(true)
  const [draft,setDraft]=useState('')
  const [smartBudget,setSmartBudget]=useState(()=>window.localStorage.getItem(PREF+'smart-budget')??'')
  const [smartPolicy,setSmartPolicy]=useState<'default'|'acceptEdits'|'plan'|'dontAsk'>(()=>{
    const saved=window.localStorage.getItem(PREF+'smart-policy')
    return saved==='acceptEdits'||saved==='plan'||saved==='dontAsk'?saved:'default'
  })
  const [smartHistory,setSmartHistory]=useState<SmartRecord[]>([])
  const [smartInspection,setSmartInspection]=useState<SmartInspection|null>(null)
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
  const [rightOpen,setRightOpen]=useState(()=>loadPreference('inspector',true))
  const [search,setSearch]=useState('')
  const [paletteOpen,setPaletteOpen]=useState(false)
  const [paletteIndex,setPaletteIndex]=useState(0)
  const [files,setFiles]=useState<FileEntry[]>([])
  const [fileTotal,setFileTotal]=useState(0)
  const [folder,setFolder]=useState('')
  const [currentFile,setCurrentFile]=useState('')
  const [fileContent,setFileContent]=useState('')
  const [savedContent,setSavedContent]=useState('')
  const [gitStatus,setGitStatus]=useState('')
  const [gitDiff,setGitDiff]=useState('')
  const [themeVariant,setThemeVariant]=useState<ThemeVariant>(()=>{
    const stored=window.localStorage.getItem(`${PREF}theme`)
    return THEME_VARIANTS.some(theme=>theme===stored)?stored as ThemeVariant:loadPreference('dark',false)?'dark':'white'
  })
  const isDark=themeVariant==='dark'||themeVariant==='ink-blue'
  const setIsDark=(checked:boolean)=>setThemeVariant(checked?'dark':'white')
  const [animate,setAnimate]=useState(()=>loadPreference('motion',true))
  const [permissionMode,setPermissionMode]=useState('default')
  const [activity,setActivity]=useState<string[]>([])
  const inputRef=useRef<HTMLTextAreaElement>(null)
  const paletteInputRef=useRef<HTMLInputElement>(null)
  const messagesEnd=useRef<HTMLDivElement>(null)
  const streamRef=useRef<HTMLDivElement>(null)
  const sessionRef=useRef('')
  const createSessionRef=useRef<()=>Promise<void>>(async()=>{})
  const selectedMissionRef=useRef('')
  const refreshGeneration=useRef(0)
  const viewRef=useRef<View>('dashboard')

  useEffect(()=>{viewRef.current=view},[view])
  useEffect(()=>{sessionRef.current=sessionId},[sessionId])
  useEffect(()=>{selectedMissionRef.current=selectedMission},[selectedMission])
  const invoke=useCallback(async<T,>(method:string,args:Record<string,unknown>={}):Promise<T>=>{
    setError('')
    try{return await api.call<T>(method,args)}
    catch(e){const reason=presentError(e);setError(reason);throw e}
  },[])
  const openChatLink=useCallback((url:string)=>{void invoke('external.open',{url}).catch(reason=>setError(presentError(reason)))},[invoke])
  const refresh=useCallback(async()=>{
    // Services update independently: a slow model or MCP lookup must not
    // hold the mission board hostage after an operation succeeds.
    const generation=++refreshGeneration.current
    const current=()=>generation===refreshGeneration.current
    const queries=[
      api.call<{models:Model[]}>('models.list').then(data=>{if(current())setModels(data.models??[])}),
      api.call<SmartRecord[]>('smart.history').then(data=>{if(current())setSmartHistory(data??[])}),
      api.call<Item[]>('sessions.list',{limit:50,offset:0})
        .then(data=>{if(current())setSessions(Array.isArray(data)?data:[])}),
      api.call<Item>('agents.overview').then(data=>{
        if(!current())return
        setOverview(data);setMode(data.mode==='super'?'super':'master')
      }),
      api.call<{missions:Mission[];selectedMissionId:string|null}>('missions.list').then(data=>{
        if(!current())return
        setMissions(data.missions??[]);setSelectedMission(data.selectedMissionId??'')
      }),
      api.call<{providers:string[]}>('credentials.list')
        .then(data=>{if(current())setSavedProviders(data.providers??[])}),
      api.call<{servers:McpServer[];errors:string[]}>('mcp.list').then(data=>{
        if(!current())return
        setMcpServers(data.servers??[]);setMcpErrors(data.errors??[])
      })
    ]
    // A hung external provider must never hold the global action lock.
    // Surface individual failures immediately instead of waiting for the
    // slowest service before showing the user a reason.
    const names=['模型列表','智能执行历史','历史会话','智能体概览','长期任务','模型凭证','MCP服务']
    const failed:string[]=[]
    queries.forEach((query,index)=>{
      void query.catch(error=>{
        if(!current())return
        failed.push(`${names[index]}：${presentError(error)}`)
        setError(`刷新部分失败：${failed.join('；')}`)
      })
    })
  },[])
  const syncMissionOverview=useCallback(()=>{
    // A later workspace refresh invalidates earlier responses, so data from
    // an old project can never overwrite the currently selected project.
    const generation=refreshGeneration.current
    void api.call<Item>('agents.overview')
      .then(data=>{if(generation===refreshGeneration.current)setOverview(data)})
      .catch(error=>{
        if(generation===refreshGeneration.current)
          setError(`智能体概览刷新失败：${presentError(error)}`)
      })
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
  const operation=useCallback(async(name:string,action:()=>Promise<unknown>)=>{
    setBusy(name)
    try{await action()}catch(error){setError(presentError(error))}finally{setBusy('')}
  },[])
  const resumeSession=useCallback(async(id:string)=>{
    await operation('恢复会话',async()=>{
      const response=await invoke<{sessionId:string;tasks?:Task[]}>('sessions.ensureOpen',{sessionId:id})
      setSessionId(response.sessionId);sessionRef.current=response.sessionId;setHistoryOnly(false);setTasks(response.tasks??[])
      const history=await invoke<unknown>('sessions.history',{sessionId:id,limit:200,offset:0})
      const rows=Array.isArray(history)?history:asObject(history)?.messages??[]
      const next=(Array.isArray(rows)?rows:[]).map((item,index)=>itemFromMessage(item,index)).filter(Boolean) as ConversationItem[]
      setMessages(next);setVisibleMessageCount(120);setFollowLatest(true);setView('chat');await refreshSession(id)
      const status=await invoke<Item>('sessions.status',{sessionId:id})
      setSessionPhase(String(status.phase??status.status??'idle'))
    })
  },[invoke,operation,refreshSession])
  useEffect(()=>{
    let alive=true
    const unsub=api.subscribe((event:AppEvent)=>{
      if(!alive)return
      if(event.event==='desktop.disconnected'){
        setConnected(false);setError(String(event.error||'桌面后台连接已断开'));return
      }
      const globalInbox=['permission.request','permission.resolved','host.request','host.resolved','smart.finished']
      if(event.sessionId&&event.sessionId!==sessionRef.current&&!globalInbox.includes(event.event))return
      if(event.event==='smart.finished'){
        void api.call<SmartRecord[]>('smart.history').then(setSmartHistory).catch(e=>setError('读取执行记录失败：'+presentError(e)))
        if(event.sessionId===sessionRef.current)setActivity(old=>['智能执行已'+(event.status==='completed'?'完成':event.status==='interrupted'?'中断':'失败'),...old].slice(0,20))
      }else if(event.event==='session.state'){
        const state=obj(event.state)
        setSessionPhase(String(state.phase??state.status??'idle'))
      }else if(event.event==='session.error'||event.event==='task.persistence.error'){
        setError(String(event.error||'任务执行异常'))
      }else if(event.event==='permission.request'){
        const p={...obj(event.permission),sessionId:String(event.sessionId||'')} as Permission
        setPermissions(old=>old.some(item=>item.id===p.id&&item.sessionId===p.sessionId)?old:[...old,p])
      }else if(event.event==='permission.resolved'){
        setPermissions(old=>old.filter(item=>item.id!==event.permissionId||item.sessionId!==event.sessionId))
      }else if(event.event==='host.request'){
        const r={...obj(event.request),sessionId:String(event.sessionId||'')} as HostRequest
        setHostForm({})
        setHostRequests(old=>old.some(item=>item.id===r.id&&item.sessionId===r.sessionId)?old:[...old,r])
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
        const info=await api.call<{workspace:string;startupSessionId?:string;initialPrompt?:string;initialView?:string}>('app.info')
        if(!alive)return
        setWorkspace(info.workspace);setFolder(info.workspace)
        await api.call('hello')
        if(!alive)return
        setConnected(true);await refresh()
        if(!alive)return
        if(info.initialView==='history')setView('history')
        if(info.initialPrompt){setDraft(info.initialPrompt);setView('chat')}
        if(info.startupSessionId)await resumeSession(info.startupSessionId)
      }catch(e){if(alive){setConnected(false);setError(presentError(e))}}
    })()
    return ()=>{alive=false;unsub()}
  },[refresh,resumeSession])
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
  useEffect(()=>{if(view==='chat'&&followLatest&&messages.length>0&&streamRef.current){streamRef.current.scrollTop=streamRef.current.scrollHeight}},[messages,view,followLatest])
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
  useEffect(()=>{
    document.documentElement.dataset.theme=themeVariant
    window.localStorage.setItem(`${PREF}dark`,String(isDark))
    window.localStorage.setItem(`${PREF}theme`,themeVariant)
  },[isDark,themeVariant])
  useEffect(()=>{document.documentElement.dataset.motion=animate?'on':'off';window.localStorage.setItem(`${PREF}motion`,String(animate))},[animate])
  useEffect(()=>{window.localStorage.setItem(`${PREF}inspector`,String(rightOpen))},[rightOpen])
  useEffect(()=>{window.localStorage.setItem(PREF+'smart-budget',smartBudget)},[smartBudget])
  useEffect(()=>{window.localStorage.setItem(PREF+'smart-policy',smartPolicy)},[smartPolicy])
  useEffect(()=>{if(paletteOpen)paletteInputRef.current?.focus()},[paletteOpen])
  useEffect(()=>{
    const onKey=(event:KeyboardEvent)=>{
      const mod=event.ctrlKey||event.metaKey
      if(mod&&event.key.toLowerCase()==='k'){event.preventDefault();setPaletteOpen(true);setPaletteIndex(0)}
      if(mod&&event.key.toLowerCase()==='n'){event.preventDefault();void createSessionRef.current()}
      if(event.key==='Escape'){setSearch('');setPaletteOpen(false)}
    }
    window.addEventListener('keydown',onKey)
    return ()=>window.removeEventListener('keydown',onKey)
  },[])
  async function executeSmart(){
    const text=draft.trim()
    if(!text||busy||!connected)return
    await operation('智能执行',async()=>{
      const maxBudgetUsd=smartBudget.trim()?Number(smartBudget):undefined
      if(maxBudgetUsd!==undefined&&(!Number.isFinite(maxBudgetUsd)||maxBudgetUsd<=0||maxBudgetUsd>100000))throw new Error('费用上限请输入大于 0 且不超过 100000 的美元金额')
      const response=await invoke<{sessionId:string;turnId:string;model:string}>('smart.execute',{
        prompt:text,
        ...(selectedModel?{model:selectedModel}:{}),
        ...(maxBudgetUsd===undefined?{}:{maxBudgetUsd}),
        ...(smartPolicy==='default'?{}:{permissionMode:smartPolicy}),
      })
      setSessionId(response.sessionId);sessionRef.current=response.sessionId
      setSessionPhase('running');setHistoryOnly(false);setTasks([])
      setMessages([{id:'local-'+Date.now(),kind:'user',text,time:Date.now()}])
      setVisibleMessageCount(120);setFollowLatest(true);setDraft('')
      setPermissionMode(smartPolicy);setSmartInspection(null);setView('chat')
      void api.call<SmartRecord[]>('smart.history').then(setSmartHistory).catch(e=>setError('读取执行记录失败：'+presentError(e)))
      void refresh()
    })
  }
  async function createSession(){
    await operation('新建会话',async()=>{
      const response=await invoke<{sessionId:string;models?:Model[];tasks?:Task[]}>('sessions.open',selectedModel?{model:selectedModel}:{})
      setSessionId(response.sessionId);sessionRef.current=response.sessionId;setSessionPhase('idle');setHistoryOnly(false);setMessages([]);setVisibleMessageCount(120);setFollowLatest(true)
      setTasks(response.tasks??[])
      setView('chat');await refresh()
    })
  }
  async function send(){
    const text=draft.trim()
    if(!text||busy)return
    setFollowLatest(true)
    if(!sessionId){
      await executeSmart()
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
    if(currentFile&&fileContent!==savedContent&&!window.confirm('当前文件存在未保存的修改。切换项目会丢失这些修改，仍要继续吗？'))return
    await operation('切换工作区',async()=>{
      const data=await invoke<{workspace:string;changed:boolean;connected?:boolean;error?:string}>('workspace.pick')
      if(!data.changed)return
      setWorkspace(data.workspace);setFolder(data.workspace);setSessionId('');sessionRef.current='';setHistoryOnly(false);setMessages([])
      setPermissions([]);setHostRequests([]);setTasks([]);setFiles([]);setFileTotal(0)
      setSessions([]);setMissions([]);setSelectedMission('');setMissionJobs([]);setOverview({});setTeamMembers([])
      setSessionPhase('idle');setActivity([]);setDraft('');setSmartHistory([]);setSmartInspection(null);setMissionQueueActive(false)
      setCurrentFile('');setGitStatus('');setGitDiff('')
      setConnected(Boolean(data.connected))
      if(data.error)setError(data.error)
      if(data.connected)await refresh()
    })
  }
  async function directory(path:string,offset=0){
    await operation('读取目录',async()=>{
      const data=await invoke<{path:string;entries:FileEntry[];total?:number}>('workspace.list',{path,offset,limit:200})
      const entries=data.entries??[]
      setFolder(data.path)
      setFiles(old=>offset>0?[...old,...entries]:entries)
      setFileTotal(data.total??offset+entries.length)
    })
  }
  async function openFile(path:string){
    if(currentFile&&currentFile!==path&&fileContent!==savedContent&&!window.confirm('当前文件存在未保存的修改。打开其他文件会丢失这些修改，仍要继续吗？'))return
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
  async function selectModel(next:string){
    await operation('切换模型',async()=>{
      if(sessionId&&!historyOnly)await invoke('sessions.setModel',{sessionId,model:next})
      setSelectedModel(next)
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
      const id=missionId(mission)
      if(!id)throw new Error('任务创建成功但后台未返回有效任务编号')
      setMissions(previous=>[mission,...previous.filter(item=>missionId(item)!==id)])
      selectedMissionRef.current=id
      setSelectedMission(id);setMissionDraft('')
      syncMissionOverview()
    })
  }
  async function missionAction(id:string,status:'active'|'paused'|'completed'){
    await operation('更新任务',async()=>{
      const mission=await invoke<Mission>('missions.updateStatus',{missionId:id,status})
      setMissions(previous=>previous.map(item=>missionId(item)===id?mission:item))
      syncMissionOverview()
    })
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
        setMessages([]);setVisibleMessageCount(120);setFollowLatest(true);setSessionPhase('idle');setTasks([])
      }
      await refreshJobs()
      syncMissionOverview()
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
      const env:Record<string,string>={}
      if(mcpType==='stdio'){
        for(const line of mcpEnvironment.split('\n')){
          if(!line.trim())continue
          const pair=/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.replace(/\r$/,''))
          if(!pair)throw new Error('环境变量请使用 NAME=VALUE 格式，每行一项')
          env[pair[1]]=pair[2]
        }
      }
      const config=mcpType==='stdio'
        ?{type:'stdio',command:mcpTarget.trim(),args:mcpArguments.split('\n').map(x=>x.trim()).filter(Boolean),...(Object.keys(env).length?{env}:{})}
        :{type:mcpType,url:mcpTarget.trim()}
      const result=await invoke<{added?:boolean;cancelled?:boolean}>('mcp.add',{name:mcpName.trim(),scope:mcpScope,config})
      if(result.added){setMcpName('');setMcpTarget('');setMcpArguments('');setMcpEnvironment('');await refresh()}
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
      const updated=await invoke<Mission>('missions.checkpoint',{missionId:selectedMission,checkpoint:checkpointDraft.trim()})
      setMissions(previous=>previous.map(item=>missionId(item)===missionId(updated)?updated:item))
      setCheckpointDraft('')
      syncMissionOverview()
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
  function toChat(prompt:string){setDraft(prompt);setView('chat')}
  useEffect(()=>{if(view==='chat'&&draft&&inputRef.current!==document.activeElement)inputRef.current?.focus()},[view,draft])
  createSessionRef.current=createSession
  const paletteCommands=[
    ...NAV.map(item=>({id:item.id,title:item.label,detail:'跳转到工作台页面',icon:item.icon,run:()=>setView(item.id)})),
    {id:'new-session',title:'新建 AI 会话',detail:'创建独立 SDK 会话 · Ctrl N',icon:Plus,run:()=>void createSession()},
    {id:'switch-workspace',title:'切换本地工作区',detail:'从磁盘选择本地项目',icon:FolderOpen,run:()=>void selectWorkspace()},
    {id:'refresh',title:'刷新工作区数据',detail:'重新读取任务、模型与服务',icon:RefreshCw,run:()=>void operation('刷新',refresh)},
    {id:'inspector',title:rightOpen?'收起上下文面板':'展开上下文面板',detail:'调整工作台布局',icon:PanelRightOpen,run:()=>setRightOpen(value=>!value)}
  ]
  const filteredCommands=paletteCommands.filter(item=>`${item.title} ${item.detail}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
  function runCommand(command:typeof paletteCommands[number]){setPaletteOpen(false);setSearch('');command.run()}
  const heading=TITLES[view]

  return <div className="app-shell app-shell-viewport yy-app flex min-h-0 overflow-hidden bg-[var(--color-surface)] text-[var(--color-text-primary)]">
    <div id="sidebar-shell" data-state="open" className="sidebar-shell yy-sidebar-shell">
      <aside className="sidebar-panel yy-sidebar flex h-full flex-col border-r border-[var(--color-border)] bg-[var(--color-surface-sidebar)]">
        <div className="flex h-[74px] shrink-0 items-center gap-3 px-5">
          <div className="yy-brand-seal flex h-10 w-10 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--color-brand)] text-[var(--color-on-primary)]"><SquareTerminal size={22} strokeWidth={1.65}/></div>
          <div className="min-w-0 flex-1"><div className="font-semibold text-[15px] tracking-[.035em]">摇摇车</div><div className="truncate text-[10px] uppercase tracking-[.16em] text-[var(--color-text-tertiary)]">Local AI Workspace</div></div>
          <button type="button" aria-label="搜索页面与操作" className="yy-icon" onClick={()=>{setPaletteOpen(true);setSearch('');setPaletteIndex(0)}}><Search size={17}/></button>
        </div>
        <div className="px-3 pb-3">
          <button type="button" className="yy-project-picker flex w-full items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] p-3 text-left shadow-[var(--shadow-card)] transition-[border-color,background-color] hover:border-[var(--color-brand)]" onClick={()=>void selectWorkspace()} title={workspace||'选择工作区'}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-brand-soft)] text-[var(--color-on-brand-soft)]"><FolderOpen size={17}/></span>
            <span className="min-w-0 flex-1"><strong className="block truncate text-[13px]">{workspace.split(/[\\/]/).filter(Boolean).at(-1)||'打开本地项目'}</strong><small className="block truncate text-[11px] text-[var(--color-text-tertiary)]">{workspace||'本机项目目录'}</small></span><ChevronDown size={14} className="shrink-0 text-[var(--color-text-tertiary)]"/>
          </button>
          <Button block size="md" variant="primary" className="mt-3 justify-center" onClick={()=>void createSession()} disabled={Boolean(busy)}><Plus size={15}/> 新建会话</Button>
        </div>
        <div className="yy-sidebar-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-4">
          <div className="flex items-center justify-between px-3 pb-2 pt-3 text-[10px] font-semibold tracking-[.12em] text-[var(--color-text-tertiary)]"><span>最近会话</span><button type="button" title="查看全部历史会话" aria-label="查看全部历史会话" className="yy-icon" onClick={()=>setView('history')}><History size={15}/></button></div>
          <div className="space-y-0.5">
            {sessions.length===0?<div className="px-3 py-3 text-xs text-[var(--color-text-tertiary)]">尚无本地会话</div>:sessions.slice(0,8).map(item=>{
              const id=String(item.sessionId||item.id||'');if(!id)return null;
              const label=String(item.summary||item.title||id.slice(0,8))
              return <button key={id} type="button" title={label} aria-label={`恢复会话：${label}`} onClick={()=>id===sessionId?setView('chat'):void resumeSession(id)} className={`yy-nav-link ${id===sessionId&&view==='chat'?'yy-nav-active':''}`}><MessageSquare size={15} className="shrink-0"/><span className="truncate">{label}</span>{id===sessionId&&<span className="ml-auto h-1.5 w-1.5 rounded-full bg-[var(--color-brand)]"/>}</button>
            })}
          </div>
          <nav aria-label="主要导航" className="mt-4">
            {NAV_GROUPS.map(group=><section key={group.label} className="mb-4">
              <div className="px-3 pb-1.5 pt-3 text-[10px] font-semibold tracking-[.13em] text-[var(--color-text-tertiary)]">{group.label}</div>
              <div className="space-y-0.5">{group.views.map(id=>{const item=NAV.find(entry=>entry.id===id);if(!item)return null;const Icon=item.icon;
                return <button type="button" key={id} aria-current={view===id?'page':undefined} onClick={()=>setView(id)} className={`yy-nav-link ${view===id?'yy-nav-active':''}`}><Icon size={17} strokeWidth={1.7}/><span className="truncate">{item.label}</span>{id==='settings'&&permissions.length>0&&<Badge size="xs" tone="warning">{permissions.length}</Badge>}</button>
              })}</div>
            </section>)}
          </nav>
        </div>
        <div className="shrink-0 border-t border-[var(--color-border)] px-5 py-4">
          <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]"><span className={`h-2 w-2 rounded-full ${connected?'bg-[var(--color-success)]':'bg-[var(--color-error)]'}`}/><span>{connected?'本地后台已连接':'后台未连接'}</span></div>
          <div className="mt-1 text-[10px] leading-5 text-[var(--color-text-tertiary)]">执行记录保留在本机</div>
        </div>
      </aside>
    </div>
    <main id="content-area" className="yy-content flex min-w-0 flex-1 flex-col overflow-hidden">
      <header className="yy-tabbar flex h-[55px] shrink-0 items-stretch justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4">
        <div role="tablist" aria-label="会话与工作区标签" className="yy-tab-strip flex min-w-0 flex-1 items-stretch gap-1 overflow-x-auto pt-2">
          <button type="button" role="tab" aria-selected={view==='chat'&&!sessionId} aria-label="标签页：新会话" onClick={()=>void createSession()} className={`yy-tab ${view==='chat'&&!sessionId?'yy-tab-active':''}`}><Plus size={15}/><span>新会话</span></button>
          {([...(sessionId&&!sessions.some(item=>String(item.sessionId||item.id||'')===sessionId)?[{sessionId,title:'当前会话'}]:[]),...sessions]).slice(0,7).map(item=>{
            const id=String(item.sessionId||item.id||'');if(!id)return null;
            const label=String(item.summary||item.title||id.slice(0,8)),active=view==='chat'&&sessionId===id;
            return <button type="button" role="tab" key={id} aria-selected={active} aria-label={`标签页：会话 · ${label}`} title={label} className={`yy-tab ${active?'yy-tab-active':''}`} onClick={()=>id===sessionId?setView('chat'):void resumeSession(id)}><MessageSquare size={14}/><span className="max-w-44 truncate">{label}</span>{active&&<span className="yy-tab-dot"/>}</button>
          })}
          {view!=='chat'&&(()=>{const item=NAV.find(e=>e.id===view);if(!item)return null;const Icon=item.icon;return <button type="button" role="tab" aria-selected="true" aria-label={`标签页：${item.label}`} className="yy-tab yy-tab-active" onClick={()=>setView(view)}><Icon size={14}/><span>{item.label}</span><span className="yy-tab-dot"/></button>})()}
        </div>
        <div className="flex shrink-0 items-center gap-1.5 pb-1">
          <button type="button" aria-label="搜索操作" title="搜索操作 (Ctrl K)" className="yy-icon" onClick={()=>{setPaletteOpen(true);setSearch('');setPaletteIndex(0)}}><Search size={17}/></button>
          <IconButton label="刷新数据" onClick={()=>void operation('刷新',refresh)}><RefreshCw size={17}/></IconButton>
          <IconButton label={rightOpen?'隐藏详情面板':'打开详情面板'} onClick={()=>setRightOpen(v=>!v)}>{rightOpen?<PanelRightClose size={17}/>:<PanelRightOpen size={17}/>}</IconButton>
        </div>
      </header>
      <div className="yy-columns flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <div key={view} className="yy-page min-w-0 flex-1 overflow-y-auto" data-view={view}>
          <div className="yy-page-inner mx-auto w-full max-w-[1220px] px-6 py-6">
          {view!=='dashboard'&&<div className="page-header"><div><span className="eyebrow">YAOYAO / WORKSPACE</span><h1>{heading[0]}</h1><p>{heading[1]}</p></div><div className="header-action">{view==='chat'?<button type="button" className="primary-button" onClick={()=>void createSession()} disabled={Boolean(busy)}><Plus size={16}/>新建会话</button>:null}</div></div>}
          {error&&<div className="error-banner" role="alert"><AlertCircle size={17}/><span>{error}</span><IconButton label="关闭错误" onClick={()=>setError('')}><X size={16}/></IconButton></div>}
          {!connected&&<div className="offline-banner"><AlertCircle size={19}/><div><strong>本地执行引擎尚未连接</strong><p>请确认桌面 Host 已构建并可启动，或选择有效工作区。页面保留可访问，执行操作需要后台连接。</p></div><button type="button" className="secondary-button" onClick={()=>void operation('重连',async()=>{await invoke('hello');setConnected(true);await refresh()})}>重新连接</button></div>}
          {view==='dashboard'&&<NewSessionStarter
            projectName={workspace.split(/[\\/]/).filter(Boolean).at(-1)||''}
            modelName={models.find(m=>m.value===selectedModel)?.displayName||'默认模型'}
            teamMode={mode==='super'?'Super Agents':'主子智能体'}
            sessions={sessions.flatMap(item=>{const id=String(item.sessionId||item.id||'');return id?[{id,label:String(item.summary||item.title||id.slice(0,8))}]:[]})}
            missions={missions.flatMap(m=>{const id=missionId(m);return id?[{id,objective:String(m.objective||'未命名任务'),status:String(m.status||'active')}]:[]})}
            task={draft} onTask={setDraft} onExecute={()=>void executeSmart()} busy={Boolean(busy)} connected={connected}
            models={models} selectedModel={selectedModel} onModel={setSelectedModel}
            budget={smartBudget} onBudget={setSmartBudget} permission={smartPolicy} onPermission={setSmartPolicy}
            executions={smartHistory} onOpenExecution={id=>void resumeSession(id)}
            onSuggestion={setDraft}
            onOpenSession={id=>id===sessionId?setView('chat'):void resumeSession(id)}
            onOpenHistory={()=>setView('history')}
            onOpenMission={id=>{setSelectedMission(id);setView('missions')}}
            onOpenMissionBoard={()=>setView('missions')}
          />}
          {view==='chat'&&<SessionChatSurface
            sessionId={sessionId} sessionPhase={sessionPhase} historyOnly={historyOnly}
            models={models} selectedModel={selectedModel} permissionMode={permissionMode}
            messages={messages} visibleMessageCount={visibleMessageCount} followLatest={followLatest} permissionsCount={permissions.length}
            draft={draft} mode={mode} busy={Boolean(busy)} connected={connected}
            smartRecord={smartHistory.find(item=>item.sessionId===sessionId)}
            streamRef={streamRef} messagesEnd={messagesEnd} inputRef={inputRef}
            onModel={next=>void selectModel(next)}
            onPermissionMode={next=>void operation('修改权限模式',async()=>{if(!sessionId)throw new Error('请先创建会话');await invoke('sessions.setPermissionMode',{sessionId,mode:next});setPermissionMode(next)})}
            onStop={()=>void operation('中断执行',()=>invoke('sessions.interrupt',{sessionId}))}
            onScrollBottom={setFollowLatest} onVisibleCount={setVisibleMessageCount} onFollowLatest={setFollowLatest}
            onOpenApprovals={()=>setView('settings')} onDraft={setDraft} onSend={()=>void send()} onOpenLink={openChatLink}
          />}
          {view==='agents'&&<div className="space-y-7">
            <Section title="协作模式" subtitle="模式切换对新会话生效，现有执行和历史记录保留。">
              <div className="grid grid-cols-2 gap-4 max-[950px]:grid-cols-1">
                {([{id:'master' as const,name:'主智能体 + 子智能体',detail:'主智能体规划和整合，子智能体执行分工。',icon:Bot},{id:'super' as const,name:'Super Agents 团队模式',detail:'团队共享任务簿，协作执行复杂目标。',icon:UsersRound}]).map(option=>{const Icon=option.icon;return <Card key={option.id} radius="lg" padding="none" shadow="card" surface="lowest" interactive>
                  <button type="button" onClick={()=>void agentMode(option.id)} className="flex w-full items-center gap-4 p-5 text-left">
                    <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-lg)] ${(mode===option.id?'bg-[var(--color-brand-soft)] text-[var(--color-on-brand-soft)]':'bg-[var(--color-surface-container)] text-[var(--color-text-secondary)]')}`}><Icon size={23}/></span>
                    <span className="min-w-0 flex-1"><strong className="block text-[14px] font-semibold">{option.name}</strong><small className="mt-1.5 block text-[12px] leading-5 text-[var(--color-text-secondary)]">{option.detail}</small></span>
                    {mode===option.id?<Badge size="sm" tone="success"><Check size={13}/>已启用</Badge>:<ArrowRight size={16} className="text-[var(--color-text-tertiary)]"/>}
                  </button>
                </Card>})}
              </div>
            </Section>
            <Section title="项目团队" subtitle="从当前工作区读取团队和真实成员信息。" action={<Button variant="secondary" size="base" onClick={()=>void operation('刷新团队',refresh)}><RefreshCw size={14}/>刷新</Button>}>
              {Array.isArray(overview.teams)&&overview.teams.length>0?
                <div className="grid grid-cols-[250px_minmax(0,1fr)] gap-4 max-[950px]:grid-cols-1">
                  <Card padding="sm" radius="lg" surface="lowest">
                    <div className="space-y-1">{(overview.teams as Item[]).map(team=>{const name=String(team.name||'');return <button type="button" key={name} onClick={()=>setSelectedTeam(name)} className={`flex w-full flex-col gap-1 rounded-[var(--radius-md)] px-3 py-3 text-left text-[12px] hover:bg-[var(--color-surface-hover)] ${(selectedTeam===name?'bg-[var(--color-brand-soft)]':'')}`}>
                      <span className="flex items-center gap-2 font-semibold"><UsersRound size={15}/>{name}</span><small className="text-[11px] text-[var(--color-text-tertiary)]">成员 {Number(team.memberCount||0)} · 执行中 {Number(team.runningCount||0)}</small>
                    </button>})}</div>
                  </Card>
                  <Card padding="lg" radius="lg" surface="lowest">
                    <div className="mb-4 flex items-center justify-between gap-2"><h3 className="text-[14px] font-semibold">{selectedTeam||'选择团队'}</h3><Badge size="sm">已发现 {teamMembers.length} 位成员</Badge></div>
                    {teamMembers.length?teamMembers.map(member=><div key={member.agentId} className="flex items-center gap-3 border-b border-[var(--color-border)] py-3 last:border-0">
                      <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-surface-container)]"><Bot size={17}/></span>
                      <span className="min-w-0 flex-1"><strong className="block truncate text-[12px]">{member.name}</strong><small className="text-[11px] text-[var(--color-text-tertiary)]">{member.agentType||'通用智能体'} · {member.model||'默认模型'}</small></span>
                      <Badge size="sm" tone={member.status==='running'?'success':'neutral'}>{member.status==='running'?'执行中':member.status==='idle'?'空闲':'状态未知'}</Badge>
                    </div>):<Empty icon={UsersRound} title="当前团队没有活动成员" detail="实际创建成员后将显示角色与运行状态。"/>}
                  </Card>
                </div>:
                <Card radius="lg" surface="lowest"><Empty icon={UsersRound} title="当前项目暂无团队" detail="先创建长期目标，然后在 Super Agents 模式下建立团队。" action={<Button variant="secondary" size="base" onClick={()=>setView('missions')}>创建长期目标 <ArrowRight size={14}/></Button>}/></Card>}
            </Section>
            <Section title="智能体执行记录" action={<Button variant="link" size="base" onClick={()=>setView('chat')}>进入对话 <ArrowRight size={14}/></Button>}>
              <Card radius="lg" surface="lowest" padding="sm">
                {tasks.length?tasks.map(task=><div className="flex flex-wrap items-center gap-3 border-b border-[var(--color-border)] p-3 last:border-0" key={task.taskId}>
                  <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-surface-container-low)]"><Activity size={16}/></span>
                  <span className="min-w-0 flex-1 truncate text-[12px]">{String(task.description||task.taskId)}</span>
                  <Badge size="sm" tone={task.status==='running'?'warning':'neutral'}>{String(task.status||'未知')}</Badge>
                  {sessionId&&task.status==='running'&&<Button variant="secondary" size="sm" aria-label="停止任务" onClick={()=>void operation('停止任务',async()=>{await invoke('tasks.stop',{sessionId,taskId:task.taskId});await refreshSession(sessionId)})}><CircleStop size={14}/>停止任务</Button>}
                  {sessionId&&['interrupted','failed','stopped'].includes(String(task.status))&&<Button variant="tonal" size="sm" aria-label="继续任务" onClick={()=>void operation('恢复任务',async()=>{await invoke('tasks.resume',{sessionId,taskId:task.taskId,prompt:'先核对已有执行结果与文件改动，再继续尚未完成的工作并提供测试证据'});await refreshSession(sessionId)})}><Play size={14}/>继续任务</Button>}
                </div>):<Empty icon={UsersRound} title="尚无运行中的智能体任务" detail="从对话开始协作后，这里会显示执行任务与状态。"/>}
              </Card>
            </Section>
          </div>}
          {view==='missions'&&<div className="grid grid-cols-[300px_minmax(0,1fr)] items-start gap-5 max-[1000px]:grid-cols-1">
            <div className="flex flex-col gap-5">
              <Card radius="lg" surface="lowest" shadow="card">
                <h2 className="mb-3 text-[14px] font-semibold">创建长期任务</h2>
                <textarea value={missionDraft} onChange={e=>setMissionDraft(e.target.value)} rows={3} placeholder="明确长期目标与交付要求…" className="w-full"/>
                <Button block variant="primary" size="md" className="mt-3" onClick={()=>void createMission()} disabled={!missionDraft.trim()||Boolean(busy)}><Plus size={15}/>创建并选中任务</Button>
              </Card>
              <Card radius="lg" surface="lowest" padding="sm">
                <div className="flex items-center justify-between gap-2 px-2 py-2"><h2 className="flex items-center gap-2 text-[13px] font-semibold"><ListChecks size={16}/>任务簿</h2><Button variant="ghost" size="sm" aria-label="刷新任务簿" onClick={()=>void operation('刷新任务簿',refresh)}><RefreshCw size={14}/></Button></div>
                <div className="space-y-1">{missions.map(m=><button type="button" key={missionId(m)} onClick={()=>{setSelectedMission(missionId(m));void operation('选择任务',()=>invoke('missions.select',{missionId:missionId(m)}))}} className={`flex min-h-[57px] w-full flex-col gap-2 rounded-[var(--radius-md)] border px-3 py-3 text-left transition-colors hover:border-[var(--color-brand)] ${(selectedMission===missionId(m)?'border-[var(--color-brand)] bg-[var(--color-brand-soft)]':'border-transparent bg-[var(--color-surface)]')}`}>
                  <strong className="line-clamp-2 text-[12px]">{m.objective||'未命名任务'}</strong><Badge size="xs" tone={m.status==='paused'?'warning':m.status==='completed'?'neutral':'success'}>{m.status==='paused'?'已暂停':m.status==='completed'?'已完成':'执行中'}</Badge>
                </button>)}
                {missions.length===0&&<Empty icon={ClipboardList} title="任务簿为空" detail="创建目标后可登记工作项和检查点。"/>}</div>
              </Card>
            </div>
            <Card radius="lg" surface="lowest" padding="lg" shadow="card">
              {selected?<div className="space-y-6">
                <div>
                  <div className="flex items-center justify-between gap-3"><h2 className="text-[14px] font-semibold">任务详情</h2><Badge size="sm" tone={selected.status==='paused'?'warning':'success'}>{selected.status||'active'}</Badge></div>
                  <h3 className="mt-3 text-[20px] font-semibold leading-8">{selected.objective}</h3>
                  <p className="mt-1 break-all font-mono text-[11px] text-[var(--color-text-tertiary)]">任务 ID：{missionId(selected)}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button variant="secondary" size="base" onClick={()=>void missionAction(missionId(selected),'active')}><Play size={14}/>恢复</Button>
                    <Button variant="secondary" size="base" onClick={()=>void missionAction(missionId(selected),'paused')}><Pause size={14}/>暂停</Button>
                    <Button variant="secondary" size="base" onClick={()=>void missionAction(missionId(selected),'completed')}><Check size={14}/>完成</Button>
                  </div>
                </div>
                <div className="border-t border-[var(--color-border)] pt-5">
                  <h3 className="text-[14px] font-semibold">Super Agents 工作项</h3>
                  <p className="my-2 text-[12px] leading-6 text-[var(--color-text-secondary)]">先登记工作，明确开始后才启动智能体。单批并发最多三项，完成结果需人工审核。</p>
                  <div className="mt-3 space-y-3 rounded-[var(--radius-lg)] bg-[var(--color-surface-container-low)] p-4">
                    <input aria-label="工作项标题" placeholder="工作项标题" className="w-full" value={jobTitle} onChange={e=>setJobTitle(e.target.value)}/>
                    <textarea aria-label="工作项执行指令" rows={3} placeholder="给智能体的完整执行要求和验收条件" className="w-full" value={jobInstruction} onChange={e=>setJobInstruction(e.target.value)}/>
                    <Button variant="secondary" size="base" disabled={!jobTitle.trim()||!jobInstruction.trim()||Boolean(busy)} onClick={()=>void addJob()}><Plus size={14}/>添加工作项</Button>
                  </div>
                </div>
                <div className="space-y-3">
                  {missionJobs.map(job=><Card key={job.id} radius="lg" padding="md" surface="base" border="solid" className="min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-[13px] font-semibold">{job.title}</h4>
                      <Badge size="sm" tone={job.status==='completed'?'success':job.status==='review'||job.status==='running'?'warning':job.status==='failed'||job.status==='interrupted'?'danger':'neutral'}>{({queued:'排队中',running:'执行中',review:'待审核',completed:'已完成',failed:'执行失败',interrupted:'已中断',cancelled:'已取消'} as Record<string,string>)[job.status]||job.status}</Badge>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-[12px] leading-5 text-[var(--color-text-secondary)]">{job.instruction}</p>
                    {job.summary&&<div className="mt-3 rounded-[var(--radius-sm)] bg-[var(--color-surface-container-low)] p-3 text-[12px] leading-6">{job.summary}</div>}
                    <div className="mt-2 text-[11px] text-[var(--color-text-tertiary)]">执行次数：{job.attempt}{job.history?.length?` · 保留 ${job.history.length} 次执行记录`:''}</div>
                    {job.history?.length?<details className="mt-3 text-[11px]"><summary className="cursor-pointer text-[var(--color-brand)]">查看历史执行详情</summary>{job.history.map(rec=><div key={`${rec.attempt}-${rec.finishedAt}`} className="mt-2 border-l-2 border-[var(--color-brand)] p-2"><strong>第 {rec.attempt} 次 · {rec.status}</strong><span className="ml-2 text-[var(--color-text-tertiary)]">{new Date(rec.finishedAt).toLocaleString('zh-CN')}</span><p className="mt-1">{rec.summary}</p></div>)}</details>:null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {job.status==='queued'&&<Button variant="secondary" size="sm" onClick={()=>void jobAction('missions.jobs.start',job.id)}><Play size={13}/>执行</Button>}
                      {job.sessionId&&<Button variant="secondary" size="sm" onClick={()=>void viewJobSession(job)}><MessageSquare size={13}/>查看会话</Button>}
                      {job.status==='review'&&<Button variant="primary" size="sm" onClick={()=>void jobAction('missions.jobs.approve',job.id)}><Check size={13}/>审核通过</Button>}
                      {(job.status==='failed'||job.status==='interrupted')&&<Button variant="tonal" size="sm" onClick={()=>void jobAction('missions.jobs.retry',job.id)}><RefreshCw size={13}/>重新排队</Button>}
                      {job.status==='running'&&<Button variant="secondary" size="sm" onClick={()=>void jobAction('missions.jobs.recover',job.id)}><History size={13}/>检查中断</Button>}
                      {job.status==='running'&&job.sessionId&&<Button variant="secondary" size="sm" onClick={()=>void operation('中断工作项',async()=>{await invoke('sessions.interrupt',{sessionId:job.sessionId});await refreshJobs()})}><CircleStop size={13}/>中断</Button>}
                      {job.status==='review'&&<Button variant="secondary" size="sm" onClick={()=>void jobAction('missions.jobs.retry',job.id)}><RefreshCw size={13}/>重新执行</Button>}
                      {['queued','review','failed','interrupted'].includes(job.status)&&<Button variant="danger-outline" size="sm" onClick={()=>void jobAction('missions.jobs.cancel',job.id)}><X size={13}/>取消</Button>}
                    </div>
                  </Card>)}
                  {missionJobs.length===0&&<p className="text-[12px] text-[var(--color-text-tertiary)]">暂无工作项，添加后可按需开始。</p>}
                </div>
                <div className="flex flex-wrap gap-2 border-t border-[var(--color-border)] pt-4">
                  <Button variant="secondary" size="base" onClick={()=>void operation('刷新工作项',()=>refreshJobs())}><RefreshCw size={14}/>刷新</Button>
                  <Button variant="primary" size="base" onClick={()=>void batchJobs()} disabled={!missionJobs.some(job=>job.status==='queued')||Boolean(busy)}><UsersRound size={14}/>并行执行待办（最多三项）</Button>
                  {missionQueueActive?<Button variant="secondary" size="base" onClick={()=>void haltMissionQueue()} disabled={Boolean(busy)}><Pause size={14}/>停止自动派发</Button>:<Button variant="tonal" size="base" onClick={()=>void runMissionQueue()} disabled={!missionJobs.some(job=>job.status==='queued')||Boolean(busy)||selected.status!=='active'}><Play size={14}/>持续推进队列</Button>}
                </div>
                <div className="border-t border-[var(--color-border)] pt-5">
                  <h3 className="mb-3 text-[13px] font-semibold">保存检查点</h3>
                  <textarea rows={4} placeholder="填写已验证进度、修改和下一步工作…" className="w-full" value={checkpointDraft} onChange={e=>setCheckpointDraft(e.target.value)}/>
                  <Button variant="accent" size="base" className="mt-2" disabled={!checkpointDraft.trim()||Boolean(busy)} onClick={()=>void checkpoint()}><Save size={14}/>记录进度</Button>
                </div>
                <div className="border-t border-[var(--color-border)] pt-5">
                  <h3 className="mb-3 text-[13px] font-semibold">已有检查点</h3>
                  {selected.checkpoint?<pre className="whitespace-pre-wrap break-words rounded-[var(--radius-md)] bg-[var(--color-surface-container-low)] p-3 text-[12px]">{selected.checkpoint}</pre>:Array.isArray(selected.checkpoints)&&selected.checkpoints.length?selected.checkpoints.map(c=><pre key={typeof c==='string'?c:json(c)} className="mb-2 whitespace-pre-wrap break-words rounded-[var(--radius-md)] bg-[var(--color-surface-container-low)] p-3 text-[12px]">{typeof c==='string'?c:json(c)}</pre>):<p className="text-[12px] text-[var(--color-text-tertiary)]">尚无检查点记录</p>}
                </div>
              </div>:<Empty icon={ListChecks} title="选择一项长期任务" detail="查看目标、创建工作项、记录进度并控制执行。"/>}
            </Card>
          </div>}
          {view==='files'&&<div className="grid min-h-[580px] grid-cols-[300px_minmax(0,1fr)] gap-4 max-[950px]:grid-cols-1">
            <Card padding="none" radius="lg" surface="lowest" className="flex min-h-[470px] flex-col overflow-hidden">
              <div className="flex h-12 items-center justify-between border-b border-[var(--color-border)] px-4"><h2 className="flex items-center gap-2 text-[13px] font-semibold"><FolderOpen size={16}/>项目目录</h2><IconButton label="刷新文件" onClick={()=>void directory(folder||workspace)}><RefreshCw size={15}/></IconButton></div>
              <button type="button" title={workspace} onClick={()=>void directory(workspace)} className="flex items-center gap-2 px-4 py-3 text-left text-[11px] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"><HardDrive size={14}/><span className="truncate">{workspace.split(/[\\/]/).filter(Boolean).at(-1)||'工作区'}</span></button>
              {folder!==workspace&&<button type="button" className="px-4 py-2 text-left text-[11px] text-[var(--color-brand)] hover:bg-[var(--color-surface-hover)]" onClick={()=>void directory(folder.replace(/[\\/][^\\/]+$/,''))}>.. 上一级目录</button>}
              <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
                {files.map(file=><button type="button" key={file.path} onClick={()=>void (file.directory?directory(file.path):openFile(file.path))} className={`flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2.5 text-left text-[12px] transition-colors hover:bg-[var(--color-surface-hover)] ${(currentFile===file.path?'bg-[var(--color-brand-soft)] text-[var(--color-on-brand-soft)]':'text-[var(--color-text-secondary)]')}`}>
                  {file.directory?<Folder size={16}/>:<FileCode2 size={16}/>}<span className="min-w-0 flex-1 truncate">{file.name}</span>
                </button>)}
                {files.length===0&&<p className="p-4 text-[11px] text-[var(--color-text-tertiary)]">选择刷新以加载文件列表</p>}
                {files.length>0&&fileTotal>files.length&&<Button block variant="secondary" size="base" disabled={Boolean(busy)} onClick={()=>void directory(folder,files.length)}>加载更多文件 · 已显示 {files.length}/{fileTotal}</Button>}
              </div>
            </Card>
            <Card padding="none" radius="lg" surface="lowest" className="flex min-w-0 flex-col overflow-hidden">
              <div className="flex h-12 items-center justify-between gap-3 border-b border-[var(--color-border)] px-4">
                <div className="flex min-w-0 items-center gap-2 text-[12px] font-semibold"><FileCode2 size={16}/><span className="truncate">{currentFile?currentFile.split(/[\\/]/).at(-1):'文件预览'}</span></div>
                {currentFile&&<Button variant={fileContent===savedContent?'ghost':'accent'} size="base" disabled={fileContent===savedContent} onClick={()=>void saveFile()}><Save size={14}/>保存文件</Button>}
              </div>
              <div className="min-h-[340px] flex-1 bg-[var(--color-code-bg)] p-3">
                {currentFile?<textarea spellCheck={false} aria-label="编辑当前文件" value={fileContent} onChange={e=>setFileContent(e.target.value)} className="h-[380px] w-full resize-y border-0! bg-transparent! font-mono text-[12px] leading-6 text-[var(--color-code-fg)] shadow-none!"/>:<Empty icon={FileCode2} title="选择文件开始预览" detail="从左侧打开文件，编辑完成后保存到当前工作区。"/>}
              </div>
              <div className="border-t border-[var(--color-border)] p-4"><div className="mb-2 flex items-center justify-between"><h3 className="flex items-center gap-2 text-[12px] font-semibold"><GitBranch size={15}/>工作区差异</h3><Button variant="link" size="sm" onClick={()=>void refreshGit()}><RefreshCw size={14}/>刷新 Git</Button></div><pre className="max-h-[190px] overflow-auto whitespace-pre-wrap break-words rounded-[var(--radius-sm)] bg-[var(--color-surface-container-low)] p-3 font-mono text-[11px] text-[var(--color-text-secondary)]">{gitDiff||gitStatus||'此处显示实际 Git 状态与工作区改动。'}</pre></div>
            </Card>
          </div>}
          {view==='models'&&<div className="space-y-7">
            <Section title="发现的模型" subtitle="模型能力由当前桌面后台返回，选择后应用到真实会话。" action={<Button size="base" variant="secondary" onClick={()=>void operation('刷新模型',refresh)}><RefreshCw size={14}/>重新检测</Button>}>
              <div className="grid grid-cols-2 gap-3 max-[1050px]:grid-cols-1">{models.map(model=><Card key={model.value} radius="lg" padding="none" surface="lowest" shadow="card" interactive>
                <button type="button" onClick={()=>void selectModel(model.value)} className="flex w-full items-center gap-4 p-5 text-left">
                  <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-lg)] ${(selectedModel===model.value?'bg-[var(--color-brand-soft)] text-[var(--color-on-brand-soft)]':'bg-[var(--color-surface-container-low)] text-[var(--color-text-secondary)]')}`}><Cpu size={22}/></span>
                  <span className="min-w-0 flex-1"><strong className="block truncate text-[14px] font-semibold">{model.displayName||model.value}</strong><code className="block truncate py-1 text-[11px] text-[var(--color-text-tertiary)]">{model.value}</code><small className="block text-[11px] text-[var(--color-text-secondary)]">{model.description||'由已配置的模型服务商提供'}</small></span>
                  {selectedModel===model.value&&<Badge size="sm" tone="success"><Check size={12}/>当前选择</Badge>}
                </button>
              </Card>)}</div>
              {models.length===0&&<Card surface="lowest"><Empty icon={Cpu} title="尚未发现可用模型" detail="请检查服务商配置和桌面后台连接。"/></Card>}
            </Section>
            <Section title="服务商凭证" subtitle="调用本地安全凭证服务，仅展示配置状态。">
              <Card radius="lg" surface="lowest" padding="none" shadow="card">
                <div className="grid grid-cols-[210px_minmax(0,1fr)] max-[900px]:grid-cols-1">
                  <div className="space-y-1 border-r border-[var(--color-border)] p-3 max-[900px]:border-b max-[900px]:border-r-0">
                    {PROVIDERS.map(provider=><button type="button" key={provider.id} onClick={()=>{setCredentialProvider(provider.id);setCredentialInput('')}} className={`flex w-full items-center gap-2 rounded-[var(--radius-md)] p-3 text-left text-[12px] transition-colors hover:bg-[var(--color-surface-hover)] ${(credentialProvider===provider.id?'bg-[var(--color-brand-soft)]':'')}`}>
                      <Cpu size={16}/><span className="flex-1">{provider.name}</span><Badge size="xs" tone={savedProviders.includes(provider.id)?'success':'neutral'}>{savedProviders.includes(provider.id)?'已配置':'未配置'}</Badge>
                    </button>)}
                  </div>
                  <div className="space-y-4 p-6">
                    <h3 className="text-[14px] font-semibold">{PROVIDERS.find(provider=>provider.id===credentialProvider)?.name}</h3>
                    <p className="text-[12px] leading-6 text-[var(--color-text-secondary)]">输入服务商密钥。保存需要系统确认，凭证由本地服务保管。</p>
                    <label htmlFor="provider-key" className="block text-[12px] font-semibold">API Key</label>
                    <input id="provider-key" className="w-full" type="password" autoComplete="off" placeholder="输入新的 API Key" value={credentialInput} onChange={e=>setCredentialInput(e.target.value)}/>
                    <div className="flex flex-wrap gap-2"><Button variant="primary" size="base" onClick={()=>void saveCredential()} disabled={!credentialInput.trim()||Boolean(busy)}><Save size={14}/>保存凭证</Button><Button variant="danger-outline" size="base" onClick={()=>void removeCredential()} disabled={!savedProviders.includes(credentialProvider)||Boolean(busy)}>移除已保存密钥</Button></div>
                    <p className="text-[11px] leading-5 text-[var(--color-text-tertiary)]">模型上下文窗口及参数以桌面后台实际返回的结果为准。</p>
                  </div>
                </div>
              </Card>
            </Section>
            <Card radius="lg" surface="low"><div className="flex flex-wrap items-center gap-3"><ShieldCheck size={19} className="text-[var(--color-brand)]"/><span className="flex-1 text-[12px] text-[var(--color-text-secondary)]">模型参数由后端统一管理，桌面端显示实际发现结果。</span><Button variant="link" size="base" onClick={()=>void operation('模型离线检查',async()=>setSmartInspection(await invoke<SmartInspection>('smart.inspect',selectedModel?{model:selectedModel}:{})))}>检查配置 <ArrowRight size={14}/></Button></div></Card>
          </div>}
          {view==='models'&&smartInspection&&<Card radius="lg" surface="lowest"><div className="flex items-center gap-2"><ShieldCheck size={17}/><strong>模型自检 · {smartInspection.model}</strong><Badge tone={smartInspection.status==='missing-credential'?'danger':'success'}>{smartInspection.status==='missing-credential'?'缺少凭证':'本地已检查'}</Badge></div><p className="mt-2 text-[12px] text-[var(--color-text-secondary)]">{smartInspection.message}</p>{smartInspection.contextWindow&&<p className="mt-2 text-[11px] text-[var(--color-text-tertiary)]">上下文 {smartInspection.contextWindow.toLocaleString()} Token · 输出 {smartInspection.maxOutputTokens?.toLocaleString()??'待核实'}</p>}</Card>}
          {view==='integrations'&&<div className="space-y-7">
            <div className="grid grid-cols-3 gap-4 max-[1100px]:grid-cols-1">
              {([{name:'技能 Skills',detail:'复用本地项目与用户级技能。',icon:WandSparkles,prompt:'列出当前工作区可用的全部技能，包括来源、功能、启用状态和使用方式',action:'检查已安装技能'},{name:'MCP 工具',detail:'让 AI 访问本地与外部工具。',icon:Boxes,prompt:'检查当前 MCP 服务器连接情况，列出服务、工具、授权和连接错误',action:'检查 MCP 连接'},{name:'插件与扩展',detail:'查看已注册的插件和扩展功能。',icon:Bot,prompt:'审计当前已安装的插件及其功能入口，检查是否能够正常调用',action:'检查插件'}]).map(item=>{const Icon=item.icon;return <Card key={item.name} radius="lg" surface="lowest" shadow="card" className="flex flex-col items-start gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--color-brand-soft)] text-[var(--color-brand)]"><Icon size={23}/></span>
                <h2 className="text-[15px] font-semibold">{item.name}</h2><p className="flex-1 text-[12px] text-[var(--color-text-secondary)]">{item.detail}</p>
                <Button variant="secondary" size="base" onClick={()=>toChat(item.prompt)}><Search size={14}/>{item.action}</Button>
              </Card>})}
            </div>
            <Section title="MCP 服务器管理" subtitle="项目、用户及本地作用范围内的真实配置与状态。" action={<Button variant="secondary" size="base" onClick={()=>void operation('刷新 MCP',refresh)}><RefreshCw size={14}/>刷新</Button>}>
              <Card radius="lg" padding="lg" surface="lowest" shadow="card">
                <div className="space-y-2">
                  {mcpServers.map(server=><div key={`${server.scope}:${server.name}`} className="flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-surface-container-low)]"><Boxes size={18}/></span>
                    <div className="min-w-[170px] flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="text-[12px]">{server.name}</strong><Badge size="xs" tone={server.disabled?'warning':'success'}>{server.disabled?'已禁用':'已启用'}</Badge></div><p className="mt-1 break-all text-[11px] text-[var(--color-text-tertiary)]">{server.scope} · {server.type}{server.url?` · ${server.url}`:''}</p></div>
                    <Button variant="secondary" size="base" onClick={()=>void manageMcp(server,'mcp.toggle')}>{server.disabled?'启用':'禁用'}</Button>
                    <Button variant="danger-outline" size="base" onClick={()=>void manageMcp(server,'mcp.remove')}><X size={14}/>移除</Button>
                  </div>)}
                  {mcpServers.length===0&&<Empty icon={Boxes} title="暂无 MCP 服务" detail="添加服务后将在这里列出。"/>}
                  {[...new Set(mcpErrors)].map(error=><p key={error} role="alert" className="text-[12px] text-[var(--color-error)]">{error}</p>)}
                </div>
                <div className="my-5 border-t border-[var(--color-border)]"/>
                <h3 className="mb-4 text-[13px] font-semibold">添加 MCP 服务</h3>
                <div className="grid grid-cols-2 gap-3 max-[800px]:grid-cols-1">
                  <label className="space-y-1 text-[12px]">名称<input className="w-full" placeholder="例如 github-mcp" value={mcpName} onChange={e=>setMcpName(e.target.value)}/></label>
                  <label className="space-y-1 text-[12px]">连接方式<select className="w-full" value={mcpType} onChange={e=>setMcpType(e.target.value as typeof mcpType)}><option value="http">HTTP</option><option value="sse">SSE</option><option value="stdio">本地命令（stdio）</option></select></label>
                  <label className="space-y-1 text-[12px]">配置范围<select className="w-full" value={mcpScope} onChange={e=>setMcpScope(e.target.value as typeof mcpScope)}><option value="project">当前项目</option><option value="user">用户级</option><option value="local">本地项目级</option></select></label>
                  <label className="space-y-1 text-[12px]">{mcpType==='stdio'?'启动命令':'服务器 URL'}<input className="w-full" placeholder={mcpType==='stdio'?'例如 npx':'https://mcp.example.com/mcp'} value={mcpTarget} onChange={e=>setMcpTarget(e.target.value)}/></label>
                  {mcpType==='stdio'&&<label className="col-span-2 space-y-1 text-[12px]">命令参数（每行一项）<textarea className="w-full" rows={3} value={mcpArguments} onChange={e=>setMcpArguments(e.target.value)} placeholder={"-y\n@example/server"}/></label>}
                   {mcpType==='stdio'&&<label className="col-span-2 space-y-1 text-[12px]">环境变量（每行 NAME=VALUE）<textarea className="w-full font-mono" rows={3} spellCheck={false} autoComplete="off" value={mcpEnvironment} onChange={e=>setMcpEnvironment(e.target.value)} placeholder={"API_TOKEN=在本机输入密钥"}/><span className="block text-[11px] text-[var(--color-text-tertiary)]">变量仅保存在所选的本地 MCP 配置，不写入界面偏好或智能执行账本。</span></label>
                </div>
                <Button variant="primary" size="base" className="mt-4" onClick={()=>void installMcp()} disabled={!mcpName.trim()||!mcpTarget.trim()||Boolean(busy)}><Plus size={14}/>添加服务</Button>
              </Card>
            </Section>
            <McpImportPanel onImported={()=>void refresh()}/>
            <p className="text-[11px] leading-5 text-[var(--color-text-tertiary)]">技能和插件检查会打开 AI 对话，MCP 管理已直接连接本地配置接口。</p>
          </div>}
          {view==='github'&&<div className="space-y-6">
  <Card surface="lowest" shadow="card" radius="lg"><div className="flex flex-wrap items-center gap-4"><span className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--color-brand-soft)] text-[var(--color-brand)]"><GitPullRequest size={24}/></span><div className="min-w-0 flex-1"><h2 className="text-[16px] font-semibold">项目 Git 工作区</h2><p className="mt-1 truncate text-[12px] text-[var(--color-text-tertiary)]">{workspace||'未打开项目'}</p><Badge size="xs" tone="success">本地仓库</Badge></div><Button variant="secondary" size="base" onClick={()=>void refreshGit()}><RefreshCw size={14}/>刷新状态</Button></div></Card>
  <div className="grid grid-cols-2 gap-4 max-[950px]:grid-cols-1">
    <Card surface="lowest" shadow="card" radius="lg"><h3 className="mb-3 flex items-center gap-2 text-[13px] font-semibold"><GitBranch size={16}/>工作区状态</h3><pre className="max-h-[250px] overflow-auto whitespace-pre-wrap break-words rounded-[var(--radius-md)] bg-[var(--color-code-bg)] p-4 font-mono text-[11px] text-[var(--color-code-fg)]">{gitStatus||'点击「刷新状态」获取当前仓库真实状态。'}</pre></Card>
    <Card surface="lowest" shadow="card" radius="lg"><h3 className="mb-3 flex items-center gap-2 text-[13px] font-semibold"><ShieldCheck size={16}/>智能代码审查</h3><p className="mb-4 text-[12px] leading-6 text-[var(--color-text-secondary)]">调用已安装的 GitHub 工具，核查关联 Pull Request。</p><Button variant="primary" size="base" onClick={()=>toChat('审查当前 Git 工作区的最新修改与关联 Pull Request，按风险等级列出问题并附上代码位置')}><GitPullRequest size={14}/>发起 PR 审查</Button></Card>
  </div>
  <Card surface="lowest" shadow="card" radius="lg"><h3 className="mb-3 flex items-center gap-2 text-[13px] font-semibold"><Code2 size={16}/>未提交改动</h3><pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-[var(--radius-md)] bg-[var(--color-code-bg)] p-4 font-mono text-[11px] text-[var(--color-code-fg)]">{gitDiff||'刷新后在这里查看 Git diff。'}</pre></Card>
</div>}
{view==='history'&&<section className="space-y-4">
  <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-[14px] font-semibold"><History size={17}/>本地会话</h2><Button variant="secondary" size="base" onClick={()=>void operation('刷新历史',refresh)}><RefreshCw size={14}/>刷新</Button></div>
  <Card radius="lg" padding="sm" surface="lowest" shadow="card">
    {sessions.length?sessions.map((s,i)=>{const id=String(s.sessionId||s.id||'');return <button type="button" key={id||i} disabled={!id} onClick={()=>void resumeSession(id)} className="flex w-full items-center gap-3 rounded-[var(--radius-md)] border-b border-[var(--color-border)] px-4 py-3 text-left transition-colors hover:bg-[var(--color-surface-hover)] last:border-0">
      <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-surface-container)]"><History size={16}/></span><span className="min-w-0 flex-1"><strong className="block truncate text-[13px]">{String(s.summary||s.title||id||'会话')}</strong><small className="block truncate pt-1 font-mono text-[10px] text-[var(--color-text-tertiary)]">{id}</small></span><span className="text-[11px] text-[var(--color-brand)]">恢复</span><ChevronRight size={15}/>
    </button>}):<Empty icon={History} title="没有历史会话" detail="会话记录按工作区保存，可从这里恢复。"/>}
  </Card>
</section>}
{view==='settings'&&<div className="space-y-6">
  <Section title="工具权限审批" subtitle="审批请求回传到发起的 SDK 会话。"><Card surface="lowest" shadow="card" radius="lg">
    {permissions.length?permissions.map(p=><div key={`${p.sessionId}:${p.id}`} className="mb-3 rounded-[var(--radius-md)] border border-[var(--color-border)] p-4 last:mb-0">
      <div className="flex items-center gap-2"><LockKeyhole size={17} className="text-[var(--color-brand)]"/><strong className="text-[13px]">{p.toolName}</strong><Badge size="xs" tone="warning">待审</Badge></div>
      <p className="mt-2 text-[11px] text-[var(--color-text-tertiary)]">{p.description||'工具请求等待确认'} · 会话 {p.sessionId.slice(0,8)}</p>
      <pre className="my-3 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-[var(--radius-sm)] bg-[var(--color-code-bg)] p-3 font-mono text-[11px] text-[var(--color-code-fg)]">{json(p.input)}</pre>
      <div className="flex justify-end gap-2"><Button variant="danger-outline" size="base" onClick={()=>void decision(p.id,false)}>拒绝</Button><Button variant="primary" size="base" onClick={()=>void decision(p.id,true)}>本次允许</Button></div>
    </div>):<Empty icon={ShieldCheck} title="当前没有待处理的审批" detail="受保护的工具操作会在这里请求许可。"/>}
  </Card></Section>
  <Section title="主机交互请求"><Card radius="lg" surface="lowest" shadow="card">{hostRequests.length?hostRequests.map(r=><div key={r.id} className="mb-3 rounded-[var(--radius-md)] border border-[var(--color-border)] p-4 last:mb-0"><strong className="text-[12px]">{String(r.type||'交互请求')}</strong><pre className="my-3 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-[var(--radius-sm)] bg-[var(--color-code-bg)] p-3 font-mono text-[11px] text-[var(--color-code-fg)]">{json(r.request||r)}</pre><Button variant="danger-outline" size="base" onClick={()=>void operation('拒绝请求',async()=>{await invoke('host.reject',{sessionId:r.sessionId,requestId:r.id,reason:'用户在桌面端拒绝请求'});await refreshSession(r.sessionId)})}>拒绝请求</Button></div>):<p className="text-[12px] text-[var(--color-text-tertiary)]">没有需要处理的主机交互请求。</p>}</Card></Section>
  <LocalMaintenance workspace={workspace} connected={connected} onPurged={()=>{
    setSessionId('');sessionRef.current='';setSessions([]);setMessages([]);setTasks([]);setPermissions([]);setHostRequests([]);setSessionPhase('idle');
    void refresh()
  }}/>
  <Section title="外观与体验" subtitle="新项目的六套原生配色与统一动效。"><Card radius="lg" surface="lowest" shadow="card">
    <div className="flex items-center justify-between gap-4 border-b border-[var(--color-border)] py-4"><span><strong className="text-[13px]">界面主题</strong><small className="mt-1 block text-[11px] text-[var(--color-text-tertiary)]">所有页面使用同一套设计令牌</small></span><select aria-label="界面主题" value={themeVariant} onChange={e=>setThemeVariant(e.target.value as ThemeVariant)}><option value="white">素白</option><option value="paper">纸墨</option><option value="warm-classic">经典暖色</option><option value="celadon">青瓷</option><option value="dark">墨夜</option><option value="ink-blue">墨夜蓝</option></select></div>
    <label className="flex cursor-pointer items-center justify-between gap-4 border-b border-[var(--color-border)] py-4"><span><strong className="text-[13px]">深色主题</strong><small className="mt-1 block text-[11px] text-[var(--color-text-tertiary)]">快速切换墨夜配色</small></span><input type="checkbox" checked={isDark} onChange={e=>setIsDark(e.target.checked)}/></label>
    <label className="flex cursor-pointer items-center justify-between gap-4 border-b border-[var(--color-border)] py-4"><span><strong className="text-[13px]">动态效果</strong><small className="mt-1 block text-[11px] text-[var(--color-text-tertiary)]">悬停、转场和减少动效支持</small></span><input type="checkbox" checked={animate} onChange={e=>setAnimate(e.target.checked)}/></label>
    <div className="flex items-center justify-between gap-4 py-4"><span><strong className="text-[13px]">侧边上下文面板</strong><small className="mt-1 block text-[11px] text-[var(--color-text-tertiary)]">任务、模型与实时状态</small></span><Button variant="secondary" size="base" onClick={()=>setRightOpen(v=>!v)}>{rightOpen?'收起面板':'展开面板'}</Button></div>
  </Card></Section>
</div>}
          </div>
        </div>
        {rightOpen&&<WorkspaceInspector
          connected={connected} phase={statusName(sessionPhase)} model={selectedModel} mode={mode}
          approvals={permissions.length} tasks={tasks.length} activity={activity} busy={busy}
          smartExecution={smartHistory.find(item=>item.sessionId===sessionId)}
          onClose={()=>setRightOpen(false)} onPermissions={()=>setView('settings')} onMissions={()=>setView('missions')} onModels={()=>setView('models')}
        />}

      </div>
      <footer className="yy-statusbar flex h-8 shrink-0 items-center gap-3 border-t border-[var(--color-border)] bg-[var(--color-surface-container-low)] px-4 text-[11px] text-[var(--color-text-tertiary)]"><span>{connected?'● 后端已连接':'○ 等待连接'}</span><span className="min-w-0 flex-1 truncate">{workspace||'未选择项目'}</span><span>{sessionId?`会话 ${sessionId.slice(0,8)} · `:''}{statusName(sessionPhase)}</span></footer>
    </main>
      {permissions.length>0&&<Modal open={true} onClose={()=>{}} dismissible={false} title="工具权限审批" typography="interface">
    <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[.1em] text-[var(--color-brand)]"><ShieldCheck size={17}/>PERMISSION REQUEST</div>
    <p className="mt-2 text-[12px] leading-6 text-[var(--color-text-secondary)]">请确认此次工具操作。结果将返回发起请求的实际会话。</p>
    <div className="my-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-4">
      <strong className="text-[12px]">{permissions[0].toolName} · 会话 {permissions[0].sessionId.slice(0,8)}</strong>
      <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-[var(--radius-sm)] bg-[var(--color-code-bg)] p-3 font-mono text-[11px] text-[var(--color-code-fg)]">{json(permissions[0].input)}</pre>
    </div>
    <div className="flex justify-end gap-2"><Button variant="danger-outline" size="base" onClick={()=>void decision(permissions[0].id,false)} disabled={Boolean(busy)}>拒绝</Button><Button variant="primary" size="base" onClick={()=>void decision(permissions[0].id,true)} disabled={Boolean(busy)}>允许本次操作</Button></div>
    {permissions.length>1&&<p className="mt-3 text-[11px] text-[var(--color-text-tertiary)]">另有 {permissions.length-1} 项待审操作</p>}
  </Modal>}
  {permissions.length===0&&requested&&<Modal open={true} onClose={()=>{}} dismissible={false} title="主机交互请求" typography="interface">
    <div className="mb-3 flex items-center gap-2 text-[12px] font-semibold"><LockKeyhole size={17} className="text-[var(--color-brand)]"/>{String(requestedDetails.title||'需要您的输入')}</div>
    <p className="mb-4 text-[12px] leading-6 text-[var(--color-text-secondary)]">{String(requestedDetails.message||requestedDetails.description||'后台请求用户处理交互内容。')}</p>
    {requestedDetails.subtype==='elicitation'&&requestedDetails.mode==='url'?<>
      <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-4">
        <strong className="text-[12px]">来自 {String(requestedDetails.mcp_server_name||'MCP')} 的链接请求</strong>
        <pre className="mt-3 whitespace-pre-wrap break-all font-mono text-[11px] text-[var(--color-text-secondary)]">{String(requestedDetails.url||'未提供链接')}</pre>
      </div>
      <p className="my-4 text-[12px] leading-5 text-[var(--color-text-tertiary)]">确认来源后在系统浏览器访问；完成授权后继续或拒绝请求。</p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="danger-outline" size="base" onClick={()=>void respondHost(requested.id,'decline')} disabled={Boolean(busy)}>拒绝访问</Button>
        <Button variant="secondary" size="base" disabled={Boolean(busy)||!String(requestedDetails.url||'').startsWith('https://')} onClick={()=>void operation('打开 MCP 链接',async()=>{const result=await invoke<{opened:boolean}>('external.open',{url:String(requestedDetails.url||'')});if(!result.opened)throw new Error('已取消在浏览器中打开链接')})}>在浏览器中打开</Button>
        <Button variant="primary" size="base" onClick={()=>void respondHost(requested.id,'accept')} disabled={Boolean(busy)}>已完成，继续</Button>
      </div>
    </>:requestedDetails.subtype==='elicitation'?<>
      <div className="space-y-3">{Object.entries(requestedProperties).map(([key,value])=>{const field=obj(value),valueType=String(field.type||'string');return <label key={key} htmlFor={`host-field-${key}`} className="flex flex-col gap-1.5 text-[12px]"><span>{String(field.title||key)}{Array.isArray(requestedSchema.required)&&requestedSchema.required.includes(key)?' *':''}</span>{Array.isArray(field.enum)?<select id={`host-field-${key}`} value={String(hostForm[key]??'')} onChange={e=>setHostForm(old=>({...old,[key]:e.target.value}))}><option value="">请选择</option>{field.enum.map((item:unknown)=><option key={String(item)} value={String(item)}>{String(item)}</option>)}</select>:valueType==='boolean'?<input id={`host-field-${key}`} type="checkbox" checked={Boolean(hostForm[key])} onChange={e=>setHostForm(old=>({...old,[key]:e.target.checked}))}/>:<input id={`host-field-${key}`} type={valueType==='number'||valueType==='integer'?'number':'text'} value={String(hostForm[key]??'')} onChange={e=>setHostForm(old=>({...old,[key]:valueType==='number'||valueType==='integer'?Number(e.target.value):e.target.value}))}/>}</label>})}</div>
      <div className="mt-5 flex justify-end gap-2"><Button variant="danger-outline" size="base" onClick={()=>void respondHost(requested.id,'decline')}>拒绝</Button><Button variant="primary" size="base" onClick={()=>void respondHost(requested.id,'accept')}>提交输入</Button></div>
    </>:<div className="flex justify-end"><Button variant="secondary" size="base" onClick={()=>void operation('取消主机请求',async()=>{await invoke('host.reject',{sessionId:requested.sessionId,requestId:requested.id,reason:'桌面端未支持该主机交互类型'});setHostRequests(old=>old.filter(r=>r.id!==requested.id||r.sessionId!==requested.sessionId))})}>取消此请求</Button></div>}
  </Modal>}
  <Modal open={paletteOpen} onClose={()=>{setPaletteOpen(false);setSearch('')}} title="快速操作" typography="interface" width={650}>
    <div className="flex items-center gap-2 border-b border-[var(--color-border)] pb-3">
      <Search size={19} className="text-[var(--color-text-tertiary)]"/>
      <input ref={paletteInputRef} aria-label="搜索命令" placeholder="搜索页面、任务与操作…" value={search} onChange={e=>{setSearch(e.target.value);setPaletteIndex(0)}} onKeyDown={e=>{if(e.key==='ArrowDown'){e.preventDefault();setPaletteIndex(index=>Math.min(index+1,Math.max(0,filteredCommands.length-1)))}if(e.key==='ArrowUp'){e.preventDefault();setPaletteIndex(index=>Math.max(0,index-1))}if(e.key==='Enter'&&filteredCommands[paletteIndex]){e.preventDefault();runCommand(filteredCommands[paletteIndex])}}} className="min-w-0 flex-1 border-0! bg-transparent! shadow-none!"/>
      <kbd className="text-[10px] text-[var(--color-text-tertiary)]">ESC</kbd>
    </div>
    <div className="mt-2 max-h-[410px] overflow-y-auto" role="listbox" aria-label="可用命令">
      {filteredCommands.length?filteredCommands.map((cmd,index)=>{const Icon=cmd.icon;return <button key={cmd.id} type="button" role="option" aria-selected={paletteIndex===index} onMouseEnter={()=>setPaletteIndex(index)} onClick={()=>runCommand(cmd)} className={`flex w-full items-center gap-3 rounded-[var(--radius-md)] p-3 text-left transition-colors hover:bg-[var(--color-surface-hover)] ${(paletteIndex===index?'bg-[var(--color-brand-soft)]':'')}`}>
        <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-surface-container-low)] text-[var(--color-brand)]"><Icon size={18}/></span>
        <span className="min-w-0 flex-1"><strong className="block truncate text-[12px]">{cmd.title}</strong><small className="mt-1 block truncate text-[11px] text-[var(--color-text-tertiary)]">{cmd.detail}</small></span><ArrowRight size={15}/>
      </button>}):<p className="py-9 text-center text-[12px] text-[var(--color-text-tertiary)]">没有匹配的操作。试试“会话”“任务”或“模型”。</p>}
    </div>
    <div className="mt-3 flex gap-4 border-t border-[var(--color-border)] pt-3 text-[10px] text-[var(--color-text-tertiary)]"><span>↑↓ 选择</span><span>Enter 执行</span><span>Esc 关闭</span></div>
  </Modal>
  {view==='settings'&&<div className="yy-legal-note"><span>本界面是非官方改造版。Based on cc-haha: </span><button type="button" onClick={()=>openChatLink('https://github.com/NanmiCoder/cc-haha')}>https://github.com/NanmiCoder/cc-haha</button><span> · Copyright (c) 2026 cc-haha</span></div>}
  </div>
}
