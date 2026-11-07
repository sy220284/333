import { useId, useRef, useState } from 'react'
import {
  ArrowRight, Bot, Code2, Cpu, FolderOpen, GitBranch, History,
  MessageSquare, Play, SearchCode, Settings2, Sparkles, UsersRound,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'

/** 使用现有 cc-haha 新首页材质，任务在这里一次启动，不强迫用户先创建会话。 */
export type StarterSession = { id: string; label: string }
export type StarterMission = { id: string; objective: string; status: string }
export type SmartExecutionPreview = {
  sessionId: string
  model: string
  status: 'running' | 'completed' | 'failed' | 'interrupted'
  costUsd?: number
}
const suggestions: { label: string; subtitle: string; prompt: string; icon: LucideIcon }[] = [
  { label: '分析当前项目结构', subtitle: '了解模块与调用关系', icon: SearchCode, prompt: '请分析当前项目的架构、主要模块与调用关系' },
  { label: '检查代码与测试', subtitle: '定位问题并核验结果', icon: Code2, prompt: '检查当前项目的主要问题，运行对应测试并给出修复建议' },
  { label: '审查最近的改动', subtitle: '理解 Git 差异和风险', icon: GitBranch, prompt: '审查当前工作区的 Git 改动，说明风险和改进点' },
  { label: '规划协作任务', subtitle: '协调主从和团队智能体', icon: UsersRound, prompt: '根据当前项目需求制定可验证的智能体协作任务方案' },
]
type Props = {
  projectName: string
  modelName: string
  teamMode: string
  sessions: StarterSession[]
  missions: StarterMission[]
  task: string
  onTask: (value: string) => void
  onExecute: () => void
  busy: boolean
  connected: boolean
  models: Array<{ value: string; displayName: string }>
  selectedModel: string
  onModel: (value: string) => void
  budget: string
  onBudget: (value: string) => void
  projectBudget: string
  onProjectBudget: (value: string) => void
  onSaveProjectBudget: () => void
  budgetState?: {limitUsd:number|null;spentUsd:number;reservedUsd:number;availableUsd:number|null;uncertainReservations:number;
    uncertain:Array<{id:string;reservedUsd:number;startedAt:string}>}
  unknownCosts:Record<string,string>
  onUnknownCost:(id:string,value:string)=>void
  onResolveUnknown:(id:string)=>void
  permission: 'default' | 'acceptEdits' | 'plan' | 'dontAsk'
  onPermission: (value: Props['permission']) => void
  executions: SmartExecutionPreview[]
  onOpenExecution: (sessionId: string) => void
  onSuggestion: (value: string) => void
  onOpenSession: (id: string) => void
  onOpenHistory: () => void
  onOpenMission: (id: string) => void
  onOpenMissionBoard: () => void
}
const executionText: Record<SmartExecutionPreview['status'], string> = {
  running: '执行中', completed: '已完成', failed: '失败', interrupted: '已中断',
}

export function NewSessionStarter({
  projectName, modelName, teamMode, sessions, missions, task, onTask, onExecute,
  busy, connected, models, selectedModel, onModel, budget, onBudget,
  projectBudget, onProjectBudget, onSaveProjectBudget, budgetState,
  unknownCosts,onUnknownCost,onResolveUnknown,
  permission, onPermission, executions, onOpenExecution,
  onSuggestion, onOpenSession, onOpenHistory, onOpenMission, onOpenMissionBoard,
}: Props) {
  const recentId = useId()
  const optionsId = useId()
  const [showOptions, setShowOptions] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  return <div data-testid="new-session-starter" className="mx-auto flex w-full max-w-[880px] flex-col gap-8 pb-8 pt-6">
    <div className="flex flex-col items-center gap-3 text-center">
      <span className="flex h-[58px] w-[58px] items-center justify-center rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-brand-soft)] text-[var(--color-brand)] shadow-[var(--shadow-card)]">
        <Sparkles size={28} strokeWidth={1.5}/>
      </span>
      <span className="text-[11px] font-medium tracking-[.13em] text-[var(--color-text-tertiary)]">WORKSPACE · {projectName || '本地项目'}</span>
      <h2 className="text-[35px] font-semibold tracking-[-.045em] text-[var(--color-text-primary)]">今天，从哪里开始？</h2>
      <p className="max-w-lg text-[13px] leading-6 text-[var(--color-text-secondary)]">描述任务后直接开始执行；系统复用当前模型、权限和本地工作区。</p>
    </div>
    <Card surface="lowest" radius="xl" padding="lg" shadow="composer" className="mx-auto w-full max-w-[720px]">
      <textarea ref={inputRef} aria-label="智能执行任务" value={task} onChange={event => onTask(event.target.value)}
        rows={4} maxLength={6000} placeholder="直接描述需要完成的任务，按 Ctrl / ⌘ + Enter 执行…"
        onKeyDown={event => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault()
            onExecute()
          }
        }}
        className="min-h-[132px] w-full resize-y border-0! bg-transparent! p-3 text-[14px] leading-6 shadow-none! focus:shadow-none!"/>
      <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-[var(--color-border)] pt-3">
        <Button variant="ghost" size="sm" onClick={() => setShowOptions(value => !value)} aria-expanded={showOptions} aria-controls={optionsId}>
          <Settings2 size={14}/>高级选项
        </Button>
        <span className="min-w-0 flex-1 text-[11px] text-[var(--color-text-tertiary)]">默认沿用当前模型与本地安全规则</span>
        <Button variant="accent" size="base" disabled={!task.trim() || busy || !connected} onClick={onExecute}>
          <Play size={15}/>智能执行
        </Button>
      </div>
      {showOptions && <div id={optionsId} className="yy-reveal mt-4 grid grid-cols-3 gap-3 border-t border-[var(--color-border)] pt-4 max-[730px]:grid-cols-1">
        <label className="flex min-w-0 flex-col gap-2 text-[11px] text-[var(--color-text-secondary)]">
          执行模型
          <select aria-label="智能执行模型" value={selectedModel} onChange={event => onModel(event.target.value)}>
            <option value="">当前默认模型</option>
            {models.map(item => <option key={item.value} value={item.value}>{item.displayName || item.value}</option>)}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-2 text-[11px] text-[var(--color-text-secondary)]">
          费用上限（美元）
          <input aria-label="智能执行费用上限" type="number" min="0.01" max="100000" step="0.01"
            value={budget} onChange={event => onBudget(event.target.value)} placeholder="留空表示不限"/>
        </label>
        <label className="flex min-w-0 flex-col gap-2 text-[11px] text-[var(--color-text-secondary)]">
          执行权限
          <select aria-label="智能执行权限" value={permission} onChange={event => onPermission(event.target.value as Props['permission'])}>
            <option value="default">继承项目规则</option>
            <option value="acceptEdits">允许编辑，其他审批</option>
            <option value="plan">规划模式</option>
            <option value="dontAsk">未授权则拒绝</option>
          </select>
        </label>
      </div>}
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-[var(--color-text-tertiary)]">
        <span className="flex items-center gap-1.5"><FolderOpen size={13}/>{projectName || '选择项目'}</span>
        <span className="flex items-center gap-1.5"><Bot size={13}/>{teamMode}</span>
        <span className="flex items-center gap-1.5"><Cpu size={13}/>{modelName}</span>
      </div>
    </Card>
    <Card surface="lowest" radius="xl" padding="lg" shadow="card" className="mx-auto w-full max-w-[720px]">
      <section aria-label="项目共享预算设置">
        <h3 className="text-[13px] font-semibold">项目共享预算设置</h3>
        <p className="mt-1 text-[11px] leading-5 text-[var(--color-text-tertiary)]">管理当前项目全部本地会话与智能体共享的额度，不影响单次任务高级选项。</p>
        <div className="flex flex-wrap items-end gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-3">
          <label className="flex min-w-[200px] flex-1 flex-col gap-2 text-[11px] text-[var(--color-text-secondary)]">
            项目共享预算（美元）
            <input aria-label="项目共享预算" type="number" min="0.01" max="100000" step="0.01"
              value={projectBudget} onChange={event=>onProjectBudget(event.target.value)}
              placeholder="留空则不限制整个项目"/>
          </label>
          <Button variant="secondary" size="sm" disabled={busy||!connected} onClick={onSaveProjectBudget}>保存项目预算</Button>
          {budgetState&&<p className="m-0 w-full text-[10px] leading-5 text-[var(--color-text-secondary)]">
            已结算 USD {budgetState.spentUsd.toFixed(4)} · 执行预占 USD {budgetState.reservedUsd.toFixed(4)}
            {budgetState.uncertainReservations>0&&` · ${budgetState.uncertainReservations} 笔费用待核实，额度继续保留`}
            {budgetState.availableUsd!==null&&` · 可用 USD ${budgetState.availableUsd.toFixed(4)}`}
          </p>}
        </div>
        {budgetState?.uncertain.map(record=><div key={record.id}
          className="flex flex-wrap items-end gap-3 rounded-[var(--radius-md)] border border-[var(--color-warning)] p-3 text-[11px]">
          <span className="min-w-0 flex-1">待核实费用 · 预占 USD {record.reservedUsd.toFixed(4)} · {record.id.slice(0,8)}</span>
          <label className="flex min-w-[130px] flex-col gap-1">实际产生费用（美元）
            <input type="number" min="0" step="0.0001" aria-label={`核实费用 ${record.id.slice(0,8)}`}
              value={unknownCosts[record.id]??''} onChange={event=>onUnknownCost(record.id,event.target.value)}/>
          </label>
          <Button variant="secondary" size="sm" disabled={busy||!connected||unknownCosts[record.id]===undefined||!unknownCosts[record.id]?.trim()}
            onClick={()=>onResolveUnknown(record.id)}>确认实际账单并释放预占</Button>
        </div>)}
        <p className="m-0 text-[10px] leading-5 text-[var(--color-text-tertiary)]">
          项目额度由全部本地 SDK 会话和智能体共享，执行前预占、模型返回后结算；最后一个模型请求仍可能超额，实际费用以服务商为准。
        </p>
      </section>
    </Card>
    <fieldset className="mx-auto grid w-full min-w-0 max-w-[720px] grid-cols-2 gap-3 border-0 p-0 max-[850px]:grid-cols-1" aria-label="建议的任务">
      {suggestions.map(({label,subtitle,prompt,icon:Icon},index) =>
        <Card key={label} radius="lg" padding="none" surface="lowest" shadow="card" interactive lift className="yy-stagger-item" style={{animationDelay:`${index*40}ms`}}>
          <button type="button" onClick={() => {onSuggestion(prompt); inputRef.current?.focus()}}
            className="flex min-h-[78px] w-full items-center gap-3 p-4 text-left">
            <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-surface-container-low)] text-[var(--color-text-secondary)]"><Icon size={18}/></span>
            <span className="flex-1"><strong className="block text-[12px] font-semibold">{label}</strong><small className="mt-1 block text-[11px] text-[var(--color-text-tertiary)]">{subtitle}</small></span>
            <ArrowRight size={15} className="text-[var(--color-text-tertiary)]"/>
          </button>
        </Card>)}
    </fieldset>
    {executions.length > 0 && <section aria-label="智能执行记录" className="yy-reveal mx-auto w-full max-w-[720px] space-y-2">
      <h3 className="flex items-center gap-2 text-[12px] font-semibold"><History size={14}/>最近智能执行</h3>
      <div className="grid grid-cols-2 gap-2 max-[750px]:grid-cols-1">
        {executions.slice(0,4).map(record =>
          <button type="button" key={record.sessionId} onClick={() => onOpenExecution(record.sessionId)}
            className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] px-3 py-3 text-left text-[11px] hover:border-[var(--color-brand)]">
            <span className="min-w-0 flex-1 truncate">{record.model} · {executionText[record.status]}</span>
            <span className="text-[var(--color-text-tertiary)]">{record.costUsd === undefined ? '费用待确认' : `${record.costUsd.toFixed(4)}`}</span>
          </button>)}
      </div>
    </section>}
    <div className="grid grid-cols-2 gap-4 max-[850px]:grid-cols-1">
      <section aria-labelledby={recentId}>
        <div className="mb-2 flex items-center justify-between">
          <h3 id={recentId} className="flex items-center gap-2 text-[12px] font-semibold"><History size={14}/>最近会话</h3>
          <Button variant="link" size="sm" onClick={onOpenHistory}>全部会话 <ArrowRight size={13}/></Button>
        </div>
        {sessions.length ? sessions.slice(0,4).map(item =>
          <button type="button" key={item.id} onClick={() => onOpenSession(item.id)}
            className="flex h-10 w-full items-center gap-2 rounded-[var(--radius-sm)] px-3 text-left text-[12px] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]">
            <MessageSquare size={14}/><span className="flex-1 truncate">{item.label}</span><ArrowRight size={13}/>
          </button>) : <p className="p-3 text-[12px] text-[var(--color-text-tertiary)]">当前工作区暂无历史会话。</p>}
      </section>
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-[12px] font-semibold"><Code2 size={14}/>进行中的长期任务</h3>
          <Button variant="link" size="sm" onClick={onOpenMissionBoard}>任务簿 <ArrowRight size={13}/></Button>
        </div>
        {missions.length ? missions.slice(0,4).map(item =>
          <button type="button" key={item.id} onClick={() => onOpenMission(item.id)}
            className="flex h-10 w-full items-center gap-2 rounded-[var(--radius-sm)] px-3 text-left text-[12px] hover:bg-[var(--color-surface-hover)]">
            <Code2 size={14}/><span className="flex-1 truncate">{item.objective}</span>
            <Badge size="xs" tone={item.status === 'active' ? 'success' : 'neutral'}>{item.status}</Badge>
          </button>) : <p className="p-3 text-[12px] text-[var(--color-text-tertiary)]">当前没有登记的长期任务。</p>}
      </section>
    </div>
  </div>
}
