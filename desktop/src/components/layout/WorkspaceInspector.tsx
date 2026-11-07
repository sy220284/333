import { Activity, AlertCircle, ChevronRight, Cpu, ListChecks, ShieldCheck, X } from 'lucide-react'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'

/** 从 cc-haha 右侧工作空间信息面板改造，所有值由 333 的实际会话状态提供。 */
export function WorkspaceInspector({connected,phase,model,mode,approvals,tasks,activity,busy,smartExecution,projectBudget,onClose,onPermissions,onMissions,onModels}:{
  connected:boolean;phase:string;model:string;mode:'master'|'super';approvals:number;tasks:number;activity:string[];busy:string;
  smartExecution?:{model:string;status:'running'|'completed'|'failed'|'interrupted';costUsd?:number;budgetUsd?:number};
  projectBudget?:{limitUsd:number|null;spentUsd:number;reservedUsd:number;availableUsd:number|null;uncertainReservations:number};
  onClose:()=>void;onPermissions:()=>void;onMissions:()=>void;onModels:()=>void;
}){
  return <aside aria-label="实时上下文" className="flex w-[268px] min-w-[268px] flex-col border-l border-[var(--color-border)] bg-[var(--color-surface-container-low)] max-[1150px]:w-[225px] max-[1150px]:min-w-[225px] max-[960px]:hidden">
    <div className="flex min-h-[55px] items-center justify-between border-b border-[var(--color-border)] px-4"><strong className="text-[12px]">实时上下文</strong><Button variant="ghost" size="sm" aria-label="收起详情" onClick={onClose}><X size={15}/></Button></div>
    <div className="min-h-0 flex-1 overflow-y-auto">
      <section className="border-b border-[var(--color-border)] p-4">
        <h3 className="mb-4 text-[10px] font-semibold tracking-[.13em] text-[var(--color-text-tertiary)]">运行状态</h3>
        <div className="flex items-center gap-3"><span className={`flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] ${(connected?'bg-[var(--color-success-container)] text-[var(--color-on-success-container)]':'bg-[var(--color-surface-container)] text-[var(--color-error)]')}`}>{connected?<Activity size={18}/>:<AlertCircle size={18}/>}</span><div><strong className="block text-[12px]">{connected?'引擎已连接':'等待连接'}</strong><small className="mt-1 block text-[11px] text-[var(--color-text-tertiary)]">{phase}</small></div></div>
      </section>
      <section className="space-y-3 border-b border-[var(--color-border)] p-4">
        <h3 className="text-[10px] font-semibold tracking-[.13em] text-[var(--color-text-tertiary)]">当前配置</h3>
        {([{label:'智能体模式',value:mode==='super'?'Super Agents':'主子模式'},{label:'当前模型',value:model||'默认模型'},{label:'待审权限',value:`${approvals} 项`},{label:'活动任务',value:String(tasks)}]).map(item=><div className="flex items-start justify-between gap-2 text-[11px]" key={item.label}><span className="text-[var(--color-text-tertiary)]">{item.label}</span><strong title={item.value} className="max-w-[125px] truncate text-right font-semibold">{item.value}</strong></div>)}
      </section>
      {projectBudget?.limitUsd!==null&&projectBudget&&<section aria-label="项目共享预算状态" className="space-y-2 border-b border-[var(--color-border)] p-4">
        <h3 className="text-[10px] font-semibold tracking-[.13em] text-[var(--color-text-tertiary)]">项目共享预算</h3>
        <div className="flex justify-between text-[11px]"><span>总额</span><strong>USD {projectBudget.limitUsd.toFixed(2)}</strong></div>
        <div className="flex justify-between text-[11px]"><span>已花费</span><strong>USD {projectBudget.spentUsd.toFixed(4)}</strong></div>
        <div className="flex justify-between text-[11px]"><span>任务预占</span><strong>USD {projectBudget.reservedUsd.toFixed(4)}</strong></div>
        {projectBudget.uncertainReservations>0&&<p className="text-[10px] text-[var(--color-warning)]">存在未核实的费用，预占额度暂不释放。</p>}
      </section>}
      {smartExecution&&<section aria-label="智能执行状态" className="space-y-3 border-b border-[var(--color-border)] p-4">
        <h3 className="text-[10px] font-semibold tracking-[.13em] text-[var(--color-text-tertiary)]">智能执行</h3>
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className="text-[var(--color-text-tertiary)]">任务状态</span>
          <Badge size="xs" tone={smartExecution.status==='completed'?'success':smartExecution.status==='failed'?'danger':smartExecution.status==='running'?'warning':'neutral'}>
            {smartExecution.status==='completed'?'已完成':smartExecution.status==='failed'?'执行失败':smartExecution.status==='running'?'执行中':'已中断'}
          </Badge>
        </div>
        <div className="flex items-start justify-between gap-2 text-[11px]"><span className="text-[var(--color-text-tertiary)]">模型</span><strong className="max-w-[130px] truncate text-right" title={smartExecution.model}>{smartExecution.model}</strong></div>
        <div className="flex justify-between gap-2 text-[11px]"><span className="text-[var(--color-text-tertiary)]">费用</span><strong>{smartExecution.costUsd===undefined?'结算中':`USD ${smartExecution.costUsd.toFixed(4)}`}</strong></div>
        {smartExecution.budgetUsd!==undefined&&<div className="flex justify-between gap-2 text-[11px]"><span className="text-[var(--color-text-tertiary)]">上限</span><strong>USD {smartExecution.budgetUsd.toFixed(2)}</strong></div>}
      </section>}
      <section className="space-y-1 border-b border-[var(--color-border)] p-4">
        <h3 className="mb-3 text-[10px] font-semibold tracking-[.13em] text-[var(--color-text-tertiary)]">快捷操作</h3>
        {([{label:'管理权限',icon:ShieldCheck,cb:onPermissions},{label:'任务簿',icon:ListChecks,cb:onMissions},{label:'模型选择',icon:Cpu,cb:onModels}]).map(action=>{const Icon=action.icon;return <button type="button" onClick={action.cb} key={action.label} className="flex h-9 w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 text-left text-[12px] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)]"><Icon size={15}/><span className="flex-1">{action.label}</span><ChevronRight size={14}/></button>})}
      </section>
      <section className="p-4"><h3 className="mb-3 text-[10px] font-semibold tracking-[.13em] text-[var(--color-text-tertiary)]">最近活动</h3>{activity.length?activity.slice(0,6).map(event=><div key={event} className="mb-3 border-l-2 border-[var(--color-brand)] pl-2 text-[11px] leading-5 text-[var(--color-text-secondary)]">{event}</div>):<p className="text-[11px] leading-5 text-[var(--color-text-tertiary)]">运行任务时将在这里显示实际活动。</p>}</section>
    </div>
    <div className="flex items-center gap-2 border-t border-[var(--color-border)] px-4 py-3 text-[11px] text-[var(--color-text-tertiary)]"><Badge tone={connected?'success':'neutral'} size="xs">{connected?'已连接':'离线'}</Badge><span className="truncate">{busy||'已就绪'}</span></div>
  </aside>
}
