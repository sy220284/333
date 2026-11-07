import {useEffect,useState} from 'react'
import {AlertTriangle,ArrowDown,Check,LoaderCircle,Send,ShieldCheck,Square} from 'lucide-react'
import {Button} from '../ui/Button'
import {MarkdownMessage} from '../../MarkdownMessage'

function ToolOutput({text}:{text:string}){
  const lengthy=text.length>1200||text.split('\n').length>18
  const failed=/(error|failed|exception|错误|失败|异常)/i.test(text)
  const [expanded,setExpanded]=useState(failed)
  const open=!lengthy||expanded
  return <details className="yy-tool-output" open={open} onToggle={event=>setExpanded(event.currentTarget.open)}><summary>{lengthy?(open?'收起工具输出':`展开工具输出 · ${text.split('\n').length} 行`):'工具输出'}</summary><pre>{text}</pre></details>
}

export type SessionChatSurfaceProps={
  sessionId:string;workspaceName:string;sessionName:string;busy:boolean;actionError:string
  messages:any[];runs:any[];approvals:any[];sessionPhase:string;sessionStopReason:string
  draft:string;setDraft:(value:string)=>void;send:(kind:string)=>void;stop:()=>void
  approve:(approval:any,decision:'allow'|'deny')=>void;setNotice:(value:string)=>void
  showThinking:boolean;setShowThinking:(value:boolean)=>void
  showTools:boolean;setShowTools:(value:boolean)=>void
  followLatest:boolean;setFollowLatest:(value:boolean)=>void
  hasEarlier:boolean;loadingEarlier:boolean;loadEarlier:()=>void
  chatScrollRef:React.RefObject<HTMLDivElement|null>;inputRef:React.RefObject<HTMLTextAreaElement|null>;registerElement:(id:string,element:HTMLElement|null)=>void
}

export function SessionChatSurface(p:SessionChatSurfaceProps){
  const [marked,setMarked]=useState<number[]>([])
  const sessionRun=p.runs.find((run:any)=>run.sessionId===p.sessionId)
  const visibleApprovals=p.approvals.filter((approval:any)=>approval.status==='pending'&&approval.sessionId===p.sessionId)
  const canStop=p.sessionPhase==='running'||p.sessionPhase==='requires_action'
  const canSend=p.sessionPhase==='idle'||p.sessionPhase==='completed'||p.sessionPhase==='failed'||p.sessionPhase==='stopped'
  useEffect(()=>{const input=p.inputRef.current;if(!input)return;input.style.height='auto';input.style.height=`${Math.min(input.scrollHeight,160)}px`},[p.draft,p.inputRef])
  const phaseLabel=p.sessionPhase==='running'?'正在执行':p.sessionPhase==='requires_action'?'等待审批':p.sessionPhase==='failed'?'执行失败':p.sessionPhase==='stopped'?'已停止':p.sessionPhase==='completed'?'已完成':'待发送'
  const runTone=p.sessionPhase==='running'?'info':p.sessionPhase==='failed'?'danger':p.sessionPhase==='completed'?'success':'neutral'
  return <section className="yy-chat-surface">
    <div className="yy-chat-status"><span><strong>{p.sessionName||'会话'}</strong><small>{p.workspaceName} · {p.sessionId||'尚未建立会话'}</small></span><span className="yy-chat-status-actions"><i className={`yy-badge yy-badge-${runTone}`}>{phaseLabel}</i><Button variant="ghost" size="sm" icon={<Square size={13}/>} onClick={p.stop} disabled={!canStop} title="停止当前任务" aria-label="停止当前任务"/></span></div>
    <div className="yy-chat-display-options"><label><input type="checkbox" checked={p.showThinking} onChange={e=>p.setShowThinking(e.target.checked)}/>思考过程</label><label><input type="checkbox" checked={p.showTools} onChange={e=>p.setShowTools(e.target.checked)}/>工具过程</label></div>
    {p.hasEarlier&&<div className="yy-history-earlier"><Button variant="secondary" size="sm" loading={p.loadingEarlier} onClick={p.loadEarlier}>加载更早消息</Button></div>}
    {p.messages.length===0&&<div className="yy-chat-empty"><strong>这个会话还没有消息</strong><span>可以先描述目标，再让智能体拆解执行。</span><div>{['检查这个工作区的结构并给出入口','运行测试并解释失败原因','阅读项目文档，列出下一步建议'].map(text=><button key={text} type="button" onClick={()=>p.setDraft(text)}>{text}</button>)}</div></div>}
    {p.messages.map((m:any,i:number)=><article className={`yy-message yy-message-${m.role||'event'}`} key={`${m.id||m.seq||i}`}><div className="yy-message-meta"><span>{m.role==='user'?'你':m.role==='assistant'?'智能体':m.event||m.kind||'事件'}</span><time>{m.createdAt?new Date(m.createdAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}):''}</time></div>{(m.role==='user'||m.role==='assistant')?<><MarkdownMessage text={m.content||m.text||''}/>{m.streaming&&<span className="yy-stream-caret" aria-label="正在生成"/>}</>:m.thinking&&p.showThinking?<pre>{m.thinking}</pre>:m.tool&&p.showTools?<><strong className="yy-tool-name">{m.tool}</strong><ToolOutput text={m.output||m.error||m.text||''}/></>:m.kind&&m.kind!=='message'?<p>{m.text||m.reason||m.kind}</p>:null}{m.role==='assistant'&&<div className="yy-message-tools"><Button variant="ghost" size="xs" onClick={()=>{navigator.clipboard?.writeText(m.content||m.text||'');p.setNotice('已复制消息')}}>复制</Button><Button variant="ghost" size="xs" aria-pressed={marked.includes(i)} onClick={()=>setMarked(old=>old.includes(i)?old.filter(n=>n!==i):[...old,i])}>{marked.includes(i)?'已标记':'标记'}</Button></div>}</article>)}
    {visibleApprovals.length>0&&<section className="yy-approval-stack" aria-label="待处理审批">{visibleApprovals.map((approval:any)=><div className="yy-approval" key={approval.id}><AlertTriangle size={17}/><div><strong>{approval.title||approval.kind||'需要你的批准'}</strong><p>{approval.detail||approval.reason||'本地引擎请求一项受控操作。'}</p></div><div className="yy-approval-actions"><Button size="base" variant="danger" onClick={()=>p.approve(approval,'deny')}>拒绝</Button><Button size="base" icon={<ShieldCheck size={14}/>} onClick={()=>p.approve(approval,'allow')}>批准</Button></div></div>)}</section>}
    {!p.followLatest&&<Button className="yy-chat-latest" size="base" icon={<ArrowDown size={14}/>} onClick={()=>{p.setFollowLatest(true);requestAnimationFrame(()=>{if(p.chatScrollRef.current)p.chatScrollRef.current.scrollTop=p.chatScrollRef.current.scrollHeight})}}>回到最新消息</Button>}
    {p.actionError&&<div className="yy-error" role="alert">{p.actionError}</div>}
    <form className="yy-chat-composer" onSubmit={e=>{e.preventDefault();p.send('send')}}><textarea ref={p.inputRef} rows={1} value={p.draft} onChange={e=>p.setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();p.send('send')}}} placeholder={canSend?'描述目标，Enter 发送，Shift + Enter 换行':'当前阶段不能发送，可停止后重试'} aria-label="发送给智能体的消息" disabled={!canSend}/><div><span>{sessionRun?`运行 ${sessionRun.id?.slice(0,12)||''} · ${sessionRun.status||p.sessionPhase}`:p.sessionStopReason||'本地引擎流式连接'}</span><Button type="submit" loading={p.busy} icon={p.busy?<LoaderCircle size={15}/>:p.sessionPhase==='failed'?<Check size={15}/>:<Send size={15}/>} disabled={!canSend||!p.draft.trim()}>{p.sessionPhase==='failed'?'重试':'发送'}</Button></div></form>
  </section>
}

export function EventMessage({event}:{event:any}){return <div className="yy-system-event"><MarkdownMessage text={String(event.text||event.kind||'')}/></div>}
