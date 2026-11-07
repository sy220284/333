import { useId, useRef, useState } from 'react'
import { ArrowRight, Bot, FolderPlus, LoaderCircle, Minus, Plus, Settings2, ShieldCheck, Users } from 'lucide-react'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Input } from '../ui/Input'
import { Modal } from '../ui/Modal'
import { desktopHost } from '../../lib/desktopHost'
import { ModelCatalogControls } from '../models/ModelCatalogControls'
import { LocalMaintenance } from './LocalMaintenance'
import { WorkspaceCapabilityMatrix } from '../workspace/WorkspaceCapabilityMatrix'
import { WorkspaceProtocolMatrix } from '../workspace/WorkspaceProtocolMatrix'

const suggestions = [
  { title: '梳理项目结构', text: '阅读当前工作区，说明主要模块、启动方式和适合先修改的位置。', icon: FolderPlus },
  { title: '做一次代码审查', text: '检查当前项目的错误处理、边界条件和安全风险，按优先级给出建议。', icon: ShieldCheck },
  { title: '运行并解释测试', text: '运行现有测试，解释失败原因；先给出修复计划，不要直接大范围改代码。', icon: Bot },
]

export function NewSessionStarter({ workspace, token, projectPath, busy, feedback, modelId, setModelId, budgetUsd, setBudgetUsd, permissionMode, setPermissionMode, teamBudgetUsd, setTeamBudgetUsd, teamBudgetRevision, onCreate, onCreateFolder, onOpenFolder, onTeam, onFeedback, onRefreshModels, onChanged }: { workspace: string; token: string; projectPath: string; busy: boolean; feedback: string; modelId: string; setModelId: (value: string) => void; budgetUsd: string; setBudgetUsd: (value: string) => void; permissionMode: string; setPermissionMode: (value: string) => void; teamBudgetUsd: string; setTeamBudgetUsd: (value: string) => void; teamBudgetRevision: number; onCreate: (objective: string) => void; onCreateFolder: () => void; onOpenFolder: () => void; onTeam: (objective: string, maxAgents: number) => void; onFeedback: (text: string) => void; onRefreshModels: () => void; onChanged: () => void }) {
  const [objective, setObjective] = useState('')
  const [showOptions, setShowOptions] = useState(false)
  const [teamOpen, setTeamOpen] = useState(false)
  const [teamBusy, setTeamBusy] = useState(false)
  const [teamObjective, setTeamObjective] = useState('')
  const [maxAgents, setMaxAgents] = useState(2)
  const [teamError, setTeamError] = useState('')
  const [activity, setActivity] = useState<any[]>([])
  const [activityRevision, setActivityRevision] = useState(0)
  const [capabilityWorkspace, setCapabilityWorkspace] = useState('')
  const [capabilityData, setCapabilityData] = useState<any>(null)
  const [protocolWorkspace, setProtocolWorkspace] = useState('')
  const [protocolData, setProtocolData] = useState<any>(null)
  const requestedActivityRevision = useRef(0)
  const optionsId = useId()
  if (capabilityWorkspace !== workspace) { setCapabilityWorkspace(workspace); setCapabilityData(null) }
  if (protocolWorkspace !== workspace) { setProtocolWorkspace(workspace); setProtocolData(null) }
  const start = (text = objective) => { if (text.trim()) onCreate(text.trim()) }
  const refreshActivity = () => { const revision = ++requestedActivityRevision.current; desktopHost.rpc('tasks.list', { workspace, token }, { timeoutMs: 10000 }).then((response: any) => { if (revision === requestedActivityRevision.current) setActivity((response.tasks || []).slice(0, 4)) }).catch(() => { if (revision === requestedActivityRevision.current) setActivity([]) }) }
  const openTeam = () => { setTeamObjective(objective); setTeamError(''); setTeamOpen(true); setActivityRevision(value => value + 1); refreshActivity() }
  const closeTeam = () => { requestedActivityRevision.current += 1; setTeamOpen(false); setTeamError('') }
  const createTeam = async () => {
    if (!teamObjective.trim()) return
    setTeamBusy(true); setTeamError('')
    try { await desktopHost.rpc('workspace.teamBudget.set', { workspace, token, budgetUsd: Number(teamBudgetUsd) || 1 }, { timeoutMs: 10000 }); onTeam(teamObjective.trim(), maxAgents); setTeamOpen(false); setActivityRevision(value => value + 1); refreshActivity() } catch (error) { setTeamError(error instanceof Error ? error.message : String(error)) } finally { setTeamBusy(false) }
  }
  return <div className="yy-starter">
    <section className="yy-starter-hero"><span className="yy-starter-mark"><Bot size={30}/></span><div><p className="yy-overline">LOCAL AGENT WORKSPACE</p><h2>把一个目标，交给本地智能体。</h2><p>文件、模型和执行记录留在你的电脑。需要权限的操作会先说明原因，再由你决定。</p></div></section>
    <section className="yy-starter-create"><textarea autoFocus value={objective} onChange={e => setObjective(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); start() } }} placeholder="例如：阅读这个项目，找出测试失败的原因，并先给我一份修复计划。" aria-label="新任务目标" rows={4}/><div className="yy-starter-create-foot"><Button variant="ghost" size="sm" icon={<Settings2 size={14}/>} aria-expanded={showOptions} aria-controls={optionsId} onClick={() => setShowOptions(!showOptions)}>高级选项</Button><div><Button variant="secondary" icon={<Users size={15}/>} onClick={openTeam} disabled={busy}>创建团队任务</Button><Button icon={busy ? <LoaderCircle size={15}/> : <ArrowRight size={15}/>} loading={busy} onClick={() => start()} disabled={!objective.trim()}>开始执行</Button></div></div>{showOptions && <div id={optionsId} className="yy-starter-options yy-workspace-form yy-reveal"><label>默认模型<ModelCatalogControls workspace={workspace} token={token} modelId={modelId} onModelId={setModelId} onFeedback={onFeedback} onRefresh={onRefreshModels} onChanged={onChanged}/></label><label>单次费用上限（美元）<Input type="number" min="0" step="0.1" value={budgetUsd} onChange={e => setBudgetUsd(e.target.value)}/></label><label>权限模式<select value={permissionMode} onChange={e => setPermissionMode(e.target.value)}><option value="default">逐项确认</option><option value="acceptEdits">允许编辑，命令确认</option><option value="plan">只读计划</option></select></label></div>}</section>
    {feedback && <p className="yy-starter-feedback" role="status">{feedback}</p>}
    <section className="yy-starter-suggestions">{suggestions.map(({ title, text, icon: Icon }, index) => <button type="button" key={title} className="yy-stagger-item" style={{animationDelay:`${index*40}ms`}} onClick={() => start(text)} disabled={busy}><Icon size={18}/><strong>{title}</strong><span>{text}</span><ArrowRight size={15}/></button>)}</section>
    <section className="yy-starter-projects"><div><FolderPlus size={17}/><span><strong>使用另一个项目目录</strong><small>可以新建目录，或选择电脑上已有的项目。</small></span></div><Button size="sm" variant="secondary" onClick={onCreateFolder}>新建项目目录</Button><Button size="sm" variant="secondary" onClick={onOpenFolder}>选择已有目录</Button></section>
    <Card title="项目共享预算设置" description="预算由本地团队任务共享，不属于单次任务高级选项。">
      <section className="yy-starter-team-budget"><label>团队共享预算（美元）<Input type="number" min="0.01" step="0.1" value={teamBudgetUsd} onChange={event => setTeamBudgetUsd(event.target.value)}/></label><Button size="sm" variant="secondary" onClick={async () => { try { const response = await desktopHost.rpc('workspace.teamBudget.set', { workspace, token, budgetUsd: Number(teamBudgetUsd) || 1 }, { timeoutMs: 10000 }) as any; setTeamBudgetUsd(String(response.budgetUsd ?? teamBudgetUsd)); onFeedback(`项目共享预算已保存：$${Number(response.budgetUsd ?? 0).toFixed(4)}；已授权 $${Number(response.authorizedUsd ?? 0).toFixed(4)}，剩余 $${Number(response.remainingUsd ?? 0).toFixed(4)}`) } catch (error) { onFeedback(error instanceof Error ? error.message : String(error)) } }}>保存共享预算</Button><small>费用上限只约束本地编排器，不等于模型服务商的账单限额。创建团队任务前会先保存预算，避免旧预算覆盖本次设置。</small></section>
    </Card>
    <WorkspaceCapabilityMatrix key={`capabilities:${workspace}`} workspace={workspace} token={token} initialData={capabilityData} onData={setCapabilityData}/>
    <WorkspaceProtocolMatrix key={`protocols:${workspace}`} workspace={workspace} token={token} initialData={protocolData} onData={setProtocolData}/>
    <LocalMaintenance key={`maintenance:${workspace}`} workspace={workspace} token={token} onError={onFeedback} onChanged={onChanged}/>
    <Modal open={teamOpen} onClose={closeTeam} title="创建团队任务" width="medium"><div className="yy-team-create"><p>由协调者拆解目标，再把子任务分配给独立智能体。每个成员都有可追踪的运行和权限边界。</p><label>团队目标<textarea rows={5} value={teamObjective} onChange={e => setTeamObjective(e.target.value)} placeholder="例如：审查认证模块，运行测试，并汇总需要人工决定的风险。"/></label><label>成员数量<div className="yy-number-stepper"><Button variant="secondary" size="sm" icon={<Minus size={14}/>} aria-label="减少成员" onClick={() => setMaxAgents(Math.max(1, maxAgents - 1))}/><strong>{maxAgents}</strong><Button variant="secondary" size="sm" icon={<Plus size={14}/>} aria-label="增加成员" onClick={() => setMaxAgents(Math.min(8, maxAgents + 1))}/></div></label><p className="yy-team-budget-note">共享预算 ${teamBudgetUsd}；协调者预留 15%，其余分配给成员，智能体创建费用也计入同一账本。</p>{teamError && <p className="yy-error">{teamError}</p>}<div className="yy-modal-actions"><Button variant="secondary" onClick={closeTeam}>取消</Button><Button loading={teamBusy} icon={<Users size={15}/>} onClick={createTeam} disabled={!teamObjective.trim()}>创建并开始</Button></div></div></Modal>
    {activity.length > 0 && <section key={activityRevision} className="yy-starter-activity yy-reveal"><h3>最近团队任务</h3>{activity.map(task => <button type="button" key={task.missionId} onClick={() => { setTeamObjective(task.objective || ''); setTeamOpen(true) }}><span>{task.status || 'unknown'}</span><strong>{task.objective || task.missionId}</strong><small>{task.progress || `${task.members?.length || 0} 位成员`}</small></button>)}</section>}
  </div>
}
