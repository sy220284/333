import type { RefObject } from 'react'
import { ArrowDown, ArrowRight, Bot, CircleStop, History, Send, ShieldCheck, Sparkles, SquareTerminal } from 'lucide-react'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { MarkdownMessage } from '../../MarkdownMessage'
import { TerminalChrome } from './TerminalChrome'
import type { ConversationItem } from '../../projection'

type Model={value:string;displayName:string}
export type SessionChatSurfaceProps={
  sessionId:string;sessionPhase:string;historyOnly:boolean;models:Model[];selectedModel:string;permissionMode:string;
  messages:ConversationItem[];visibleMessageCount:number;followLatest:boolean;permissionsCount:number;
  draft:string;mode:'master'|'super';busy:boolean;connected:boolean;
  streamRef:RefObject<HTMLDivElement|null>;messagesEnd:RefObject<HTMLDivElement|null>;inputRef:RefObject<HTMLTextAreaElement|null>;
  onModel:(value:string)=>void;onPermissionMode:(value:string)=>void;onStop:()=>void;
  onScrollBottom:(value:boolean)=>void;onVisibleCount:(value:number)=>void;onFollowLatest:(value:boolean)=>void;
  onOpenApprovals:()=>void;onDraft:(value:string)=>void;onSend:()=>void;onOpenLink:(url:string)=>void;
}
const prompts=['分析当前工作区的项目结构','检查当前工作区最新代码问题','规划一个多智能体协作任务']
export function SessionChatSurface(p:SessionChatSurfaceProps){
  const runState=p.historyOnly?'历史记录':({running:'执行中',requires_action:'等待确认',completed:'已完成',cancelled:'已取消',failed:'执行失败'} as Record<string,string>)[p.sessionPhase]||'待命'
  return <section aria-label="AI 对话区" className="flex min-h-[540px] flex-1 flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] shadow-[var(--shadow-card)]">
    <div className="flex min-h-[57px] shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] px-5 py-3">
      <div aria-live="polite" aria-atomic="true" className="flex items-center gap-2.5"><Badge size="sm" tone={p.sessionPhase==='running'?'warning':'neutral'}>{runState}</Badge>{p.sessionId&&<span title={p.sessionId} className="font-mono text-[11px] text-[var(--color-text-tertiary)]">会话 {p.sessionId.slice(0,8)}</span>}</div>
      <div className="flex items-center gap-2">
        <select aria-label="当前模型" value={p.selectedModel} disabled={p.historyOnly} onChange={e=>p.onModel(e.target.value)}><option value="">默认模型</option>{p.models.map(m=><option key={m.value} value={m.value}>{m.displayName||m.value}</option>)}</select>
        <select aria-label="权限模式" disabled={p.historyOnly} value={p.permissionMode} onChange={e=>p.onPermissionMode(e.target.value)}><option value="default">默认权限</option><option value="acceptEdits">允许编辑</option><option value="plan">规划模式</option><option value="dontAsk">拒绝后继续</option><option value="bypassPermissions">跳过确认（危险）</option></select>
        {p.sessionId&&!p.historyOnly&&<Button size="base" variant="ghost" onClick={p.onStop} aria-label="停止当前执行"><CircleStop size={17}/></Button>}
      </div>
    </div>
    <div ref={p.streamRef} onScroll={e=>{const node=e.currentTarget;p.onScrollBottom(node.scrollHeight-node.scrollTop-node.clientHeight<96)}} className="flex min-h-[220px] flex-1 flex-col gap-5 overflow-y-auto px-5 py-6">
      {p.messages.length===0?<div className="m-auto flex w-full max-w-[620px] flex-col items-center gap-4 text-center">
        <EmptyState variant="plain" size="lg" icon={<Sparkles size={24}/>} title="今天想完成什么？" description="分析项目、编写代码、管理任务，或邀请智能体协作。"/>
        <div className="flex flex-wrap justify-center gap-2">{prompts.map(prompt=><Button key={prompt} size="base" variant="secondary" onClick={()=>p.onDraft(prompt)}>{prompt}<ArrowRight size={13}/></Button>)}</div>
      </div>:<>
        {p.messages.length>p.visibleMessageCount&&<Button variant="secondary" size="base" onClick={()=>{p.onVisibleCount(p.visibleMessageCount+120);p.onFollowLatest(false)}}>加载更早的 {Math.min(120,p.messages.length-p.visibleMessageCount)} 条消息</Button>}
        {p.messages.slice(-p.visibleMessageCount).map(m=><article key={m.id} className="mx-auto flex w-full max-w-[840px] gap-3">
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] ${(m.kind==='user'?'bg-[var(--color-brand-soft)] text-[var(--color-on-brand-soft)]':'bg-[var(--color-surface-container-low)] text-[var(--color-text-secondary)]')}`}>{m.kind==='user'?<span className="text-[11px]">我</span>:m.kind==='assistant'?<Sparkles size={16}/>:<SquareTerminal size={16}/>}</div>
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center gap-3"><span className="text-[12px] font-semibold">{m.kind==='user'?'你':m.kind==='assistant'?'摇摇车':'工具'}</span><time className="text-[10px] text-[var(--color-text-tertiary)]">{new Date(m.time).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}</time></div>
            {m.kind==='tool'?<TerminalChrome label="工具执行"><div className="max-h-96 overflow-auto px-4 py-3 font-mono text-xs whitespace-pre-wrap break-words">{m.text}</div></TerminalChrome>:<div className="whitespace-pre-wrap break-words text-[13px] leading-7 text-[var(--color-text-primary)]">{m.kind==='assistant'?<MarkdownMessage text={m.text} onOpenLink={p.onOpenLink}/>:m.text}</div>}
          </div>
        </article>)}
      </>}
      <div ref={p.messagesEnd}/>
    </div>
    {!p.followLatest&&p.messages.length>0&&<div className="flex justify-center pb-2"><Button variant="tonal" size="sm" onClick={()=>p.onFollowLatest(true)}><ArrowDown size={13}/>回到最新消息</Button></div>}
    {p.permissionsCount>0&&<div className="flex flex-wrap items-center gap-3 border-t border-[var(--color-border)] bg-[var(--color-warning-container)] px-5 py-3 text-[12px] text-[var(--color-on-warning-container)]"><ShieldCheck size={17}/><span>{p.permissionsCount} 项工具操作等待批准</span><Button variant="secondary" size="sm" onClick={p.onOpenApprovals}>查看审批<ArrowRight size={13}/></Button></div>}
    {p.historyOnly&&<div className="flex items-center gap-3 border-t border-[var(--color-border)] bg-[var(--color-surface-container-low)] px-5 py-3 text-[12px] text-[var(--color-text-secondary)]"><History size={16}/>当前正在查看历史执行记录。发送新消息时将恢复原会话。</div>}
    <div className="shrink-0 border-t border-[var(--color-border)] p-4">
      <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 pt-3 shadow-[var(--shadow-composer)]">
        <textarea ref={p.inputRef} aria-label="输入任务" value={p.draft} onChange={e=>p.onDraft(e.target.value)} placeholder="描述任务，支持引用项目文件与技能…" rows={3} onKeyDown={e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();p.onSend()}}} className="min-h-[68px] w-full resize-none border-0! bg-transparent! shadow-none! focus:shadow-none!"/>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] py-2.5">
          <div className="flex items-center gap-3 text-[11px] text-[var(--color-text-tertiary)]"><span className="flex items-center gap-1.5"><Bot size={14}/>{p.mode==='super'?'Super Agents':'主子智能体'}</span><span>Ctrl / ⌘ + Enter 发送</span></div>
          <Button variant="accent" size="base" aria-label="发送" disabled={!p.draft.trim()||p.busy||!p.connected} onClick={p.onSend}><Send size={15}/>发送</Button>
        </div>
      </div>
    </div>
  </section>
}
