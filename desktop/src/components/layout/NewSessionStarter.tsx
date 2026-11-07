import { useId } from 'react'
import { ArrowRight, Bot, Code2, Cpu, FolderOpen, GitBranch, History, MessageSquare, Plus, SearchCode, Sparkles, UsersRound, type LucideIcon } from 'lucide-react'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'

/** cc-haha NewSessionStarter 的工作流和视觉构成，适配摇摇车 Electron 本地业务控制器。 */
export type StarterSession={id:string;label:string}
export type StarterMission={id:string;objective:string;status:string}
const suggestions:{label:string;subtitle:string;prompt:string;icon:LucideIcon}[]=[
  {label:'分析当前项目结构',subtitle:'了解模块与调用关系',icon:SearchCode,prompt:'请分析当前项目的架构、主要模块与调用关系'},
  {label:'检查代码与测试',subtitle:'定位问题并核验结果',icon:Code2,prompt:'检查当前项目的主要问题，运行对应测试并给出修复建议'},
  {label:'审查最近的改动',subtitle:'理解 Git 差异和风险',icon:GitBranch,prompt:'审查当前工作区的 Git 改动，说明风险和改进点'},
  {label:'规划协作任务',subtitle:'协调主从和团队智能体',icon:UsersRound,prompt:'根据当前项目需求制定可验证的智能体协作任务方案'}
]
export function NewSessionStarter({projectName,modelName,teamMode,sessions,missions,onCreateSession,onSuggestion,onOpenSession,onOpenHistory,onOpenMission,onOpenMissionBoard}:{
  projectName:string;modelName:string;teamMode:string;sessions:StarterSession[];missions:StarterMission[];
  onCreateSession:()=>void;onSuggestion:(value:string)=>void;onOpenSession:(id:string)=>void;
  onOpenHistory:()=>void;onOpenMission:(id:string)=>void;onOpenMissionBoard:()=>void;
}){
  const recentId=useId()
  return <div data-testid="new-session-starter" className="mx-auto flex w-full max-w-[880px] flex-col gap-8 pb-8 pt-6">
    <div className="flex flex-col items-center gap-3 text-center">
      <span className="flex h-[58px] w-[58px] items-center justify-center rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-brand-soft)] text-[var(--color-brand)] shadow-[var(--shadow-card)]"><Sparkles size={28} strokeWidth={1.5}/></span>
      <span className="text-[11px] font-medium tracking-[.13em] text-[var(--color-text-tertiary)]">WORKSPACE · {projectName||'本地项目'}</span>
      <h2 className="text-[35px] font-semibold tracking-[-.045em] text-[var(--color-text-primary)]">今天，从哪里开始？</h2>
      <p className="max-w-lg text-[13px] leading-6 text-[var(--color-text-secondary)]">选择任务起点或开始新会话，使用当前项目的本地执行引擎处理工作。</p>
    </div>
    <Card surface="lowest" radius="xl" padding="lg" shadow="composer" className="mx-auto w-full max-w-[720px]">
      <button type="button" aria-label="新建会话" onClick={onCreateSession} className="flex w-full items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-4 text-left text-[13px] text-[var(--color-text-tertiary)] transition-colors hover:border-[var(--color-brand)]">
        <MessageSquare size={20}/><span className="flex-1">打开新会话，输入今天的任务…</span><span className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-brand)] text-[var(--color-on-primary)]"><Plus size={16}/></span>
      </button>
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-[var(--color-text-tertiary)]">
        <span className="flex items-center gap-1.5"><FolderOpen size={13}/>{projectName||'选择项目'}</span>
        <span className="flex items-center gap-1.5"><Bot size={13}/>{teamMode}</span>
        <span className="flex items-center gap-1.5"><Cpu size={13}/>{modelName}</span>
      </div>
    </Card>
    <div className="mx-auto grid w-full max-w-[720px] grid-cols-2 gap-3 max-[850px]:grid-cols-1" aria-label="建议的任务">
      {suggestions.map(({label,subtitle,prompt,icon:Icon})=><Card key={label} radius="lg" padding="none" surface="lowest" shadow="card" interactive lift>
        <button type="button" onClick={()=>onSuggestion(prompt)} className="flex min-h-[78px] w-full items-center gap-3 p-4 text-left">
          <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-surface-container-low)] text-[var(--color-text-secondary)]"><Icon size={18}/></span>
          <span className="flex-1"><strong className="block text-[12px] font-semibold">{label}</strong><small className="mt-1 block text-[11px] text-[var(--color-text-tertiary)]">{subtitle}</small></span><ArrowRight size={15} className="text-[var(--color-text-tertiary)]"/>
        </button>
      </Card>)}
    </div>
    <div className="grid grid-cols-2 gap-4 max-[850px]:grid-cols-1">
      <section aria-labelledby={recentId}>
        <div className="mb-2 flex items-center justify-between"><h3 id={recentId} className="flex items-center gap-2 text-[12px] font-semibold"><History size={14}/>最近会话</h3><Button variant="link" size="sm" onClick={onOpenHistory}>全部会话 <ArrowRight size={13}/></Button></div>
        {sessions.length? sessions.slice(0,4).map(s=><button type="button" key={s.id} onClick={()=>onOpenSession(s.id)} className="flex h-10 w-full items-center gap-2 rounded-[var(--radius-sm)] px-3 text-left text-[12px] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"><MessageSquare size={14}/><span className="flex-1 truncate">{s.label}</span><ArrowRight size={13}/></button>):<p className="p-3 text-[12px] text-[var(--color-text-tertiary)]">当前工作区暂无历史会话。</p>}
      </section>
      <section>
        <div className="mb-2 flex items-center justify-between"><h3 className="flex items-center gap-2 text-[12px] font-semibold"><Code2 size={14}/>进行中的长期任务</h3><Button variant="link" size="sm" onClick={onOpenMissionBoard}>任务簿 <ArrowRight size={13}/></Button></div>
        {missions.length?missions.slice(0,4).map(m=><button type="button" key={m.id} onClick={()=>onOpenMission(m.id)} className="flex h-10 w-full items-center gap-2 rounded-[var(--radius-sm)] px-3 text-left text-[12px] hover:bg-[var(--color-surface-hover)]"><Code2 size={14}/><span className="flex-1 truncate">{m.objective}</span><Badge size="xs" tone={m.status==='active'?'success':'neutral'}>{m.status}</Badge></button>):<p className="p-3 text-[12px] text-[var(--color-text-tertiary)]">当前没有登记的长期任务。</p>}
      </section>
    </div>
  </div>
}
