/**
 * Read-only supervision based on persisted facts; never dispatches workers.
 * A finding is a suggested next action with a stable reference, not an
 * invented completion or an implicit user authorization.
 */
import { resolve } from 'node:path'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { listMissions } from '../../utils/agentMissions.js'
import { listMissionJobs, type MissionJob } from './missionJobs.js'
import { listTeamHandoffs, type Handoff } from './teamHandoffs.js'
import { listAgentProfiles, type AgentProfile } from './agentRegistry.js'
import { listProjectExperiences, type ProjectExperience } from './experienceMemory.js'
import { listSkillDrafts, type SkillDraft } from './skillWorkshop.js'

export type SupervisorFinding = {
  id: string
  kind: 'job'|'handoff'|'experience'|'skill'|'identity'
  priority: 'review'|'blocked'|'followup'
  title: string
  detail: string
  nextAction: string
  missionId?: string
  jobId?: string
  handoffId?: string
  experienceId?: string
  draftId?: string
  agentId?: string
}
export type SupervisorInput = {
  jobs: Array<{missionId:string;missionStatus:string;job:MissionJob}>
  handoffs: Handoff[]
  agents: AgentProfile[]
  experiences: ProjectExperience[]
  drafts: SkillDraft[]
}
const priorityRank:Record<SupervisorFinding['priority'],number> = {
  blocked:0,review:1,followup:2,
}
export function analyzeProjectSupervisor(input:SupervisorInput):SupervisorFinding[] {
  const items:SupervisorFinding[]=[]
  for(const {missionId,missionStatus,job} of input.jobs){
    const base={kind:'job' as const,missionId,jobId:job.id}
    if(job.status==='review')items.push({...base,id:'job-review:'+job.id,priority:'review',
      title:job.title,detail:'工作项执行已结束，仍需核验成果及原生工作树',
      nextAction:'打开长期任务工作项，查看真实成果和测试证据后审核'})
    if(job.status==='interrupted'||job.status==='failed')items.push({
      ...base,id:'job-recover:'+job.id,priority:'blocked',
      title:job.title,detail:job.summary??'执行中断或失败',
      nextAction:'核对已写入的文件和外部副作用，再选择恢复或重试',
    })
    if(job.status==='queued'&&missionStatus!=='active')items.push({
      ...base,id:'job-paused:'+job.id,priority:'blocked',title:job.title,
      detail:'长期目标已暂停，此工作项不会自动启动',
      nextAction:'项目负责人检查目标后显式恢复长期任务'})
  }
  for(const handoff of input.handoffs){
    const base={kind:'handoff' as const,handoffId:handoff.id}
    if(handoff.status==='draft')items.push({...base,id:'handoff-retry:'+handoff.id,
      priority:'blocked',title:handoff.summary,
      detail:'交接已登记但没有得到原生信箱写入确认',
      nextAction:'确认团队和成员仍有效，使用相同交接编号重试投递'})
    if(handoff.status==='review')items.push({...base,id:'handoff-review:'+handoff.id,
      priority:'review',title:handoff.summary,
      detail:'成员已提交成果引用，等待负责人实际验收',
      nextAction:'打开成果并记录审核意见，确认通过后归档交接'})
  }
  for(const experience of input.experiences){
    if(experience.status==='candidate')items.push({
      id:'experience-review:'+experience.id,kind:'experience',priority:'review',
      experienceId:experience.id,title:experience.title,
      detail:'候选经验需要核验真实来源及适用条件',
      nextAction:'前往能力中心核查证据，记录人工审核结论后批准或废弃',
    })
  }
  for(const draft of input.drafts){
    if(draft.state==='candidate')items.push({
      id:'skill-review:'+draft.id,kind:'skill',priority:'review',
      draftId:draft.id,title:draft.slug,
      detail:'AI 或用户提出的技能草稿尚未发布',
      nextAction:'核对技能正文、影响范围和执行权限后按需发布',
    })
  }
  for(const agent of input.agents){
    if(agent.status==='paused')continue
    const roles=agent.roles.filter(role=>role.state==='active')
    if(agent.status==='available'&&roles.length===0)items.push({
      id:'identity-unassigned:'+agent.id,kind:'identity',priority:'followup',
      agentId:agent.id,title:agent.name,detail:'稳定身份已建立，但目前没有在岗职责',
      nextAction:'在智能体团队页按具体目标分配职责；此操作不会启动模型',
    })
  }
  return items.sort((a,b)=>priorityRank[a.priority]-priorityRank[b.priority]||
    a.kind.localeCompare(b.kind)||a.id.localeCompare(b.id)).slice(0,200)
}
/** Project isolation is checked before reading any nested mission jobs. */
export async function getProjectSupervisorSnapshot(
  projectDir:string,options:{dataDir?:string;missionRoot?:string}={},
):Promise<{findings:SupervisorFinding[];counts:{blocked:number;review:number;followup:number}}> {
  const project=resolve(projectDir)
  const root=options.dataDir??getClaudeConfigHomeDir()
  const missions=(await listMissions(options.missionRoot))
    .filter(mission=>resolve(mission.projectDir)===project)
  const [allJobs,handoffs,agents,experiences,drafts]=await Promise.all([
    Promise.all(missions.map(async mission=>({
      mission,
      jobs:await listMissionJobs(mission.id,project,options.missionRoot),
    }))),
    listTeamHandoffs(project,root),
    listAgentProfiles(project,root),
    listProjectExperiences(project,{root,includeCandidates:true}),
    listSkillDrafts(project,root),
  ])
  const jobs=allJobs.flatMap(({mission,jobs})=>jobs.map(job=>({
    missionId:mission.id,missionStatus:mission.status,job,
  })))
  const findings=analyzeProjectSupervisor({jobs,handoffs,agents,experiences,drafts})
  return {findings,counts:{
    blocked:findings.filter(item=>item.priority==='blocked').length,
    review:findings.filter(item=>item.priority==='review').length,
    followup:findings.filter(item=>item.priority==='followup').length,
  }}
}
