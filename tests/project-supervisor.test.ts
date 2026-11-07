import { expect, test } from 'bun:test'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { analyzeProjectSupervisor, getProjectSupervisorSnapshot,
  type SupervisorInput } from '../src/services/agentCenter/projectSupervisor.js'
import { createAgentProfile } from '../src/services/agentCenter/agentRegistry.js'
import { proposeProjectExperience } from '../src/services/agentCenter/experienceMemory.js'

test('总控只依据事实列出阻塞任务和待投递交接',()=>{
  const input={
    jobs:[{missionId:'mission_0123456789abcdef',missionStatus:'paused',
      job:{id:'job_0123456789abcdef',title:'原计划',instruction:'核对事实',status:'queued',attempt:0}}],
    handoffs:[{id:randomUUID(),teamName:'研发',from:'team-lead',to:'前端',
      summary:'接口交接未投递',instruction:'按新接口检查组件并保留测试',
      inputRefs:[],outputRefs:[],status:'draft'}],
    agents:[],experiences:[],drafts:[],
  } as unknown as SupervisorInput
  const result=analyzeProjectSupervisor(input)
  expect(result).toHaveLength(2)
  expect(result.every(item=>item.priority==='blocked')).toBe(true)
  expect(new Set(result.map(item=>item.id)).size).toBe(2)
})
test('项目状态读取仅显示本项目的候选经验和稳定身份',async()=>{
  const root=await mkdtemp(join(tmpdir(),'supervisor-projection-'))
  const project=join(root,'project')
  try{
    await createAgentProfile(project,{
      id:randomUUID(),name:'研究成员',description:'核查项目来源和结论的可验证性',
      domains:['研究'],capabilityIds:[],
    },root)
    await proposeProjectExperience(project,{
      key:'supervisor-review',title:'档案来源校核准则',
      scenario:'原始档案与后世转写资料之间存在明显矛盾',
      principle:'优先核对一手来源和可重查的文献馆藏编号',
      procedure:['先确认年代来源和原件馆藏编号','再交叉比对独立资料与翻译差异'],
      applicability:'需要验证史料来源的研究项目',
      invalidWhen:'创意故事正文无需档案佐证时',
      verification:'查看原件目录和年代后记录可追溯出处',
      evidenceRefs:['artifact:research:checked'],tags:['研究','来源'],
    },root)
    const result=await getProjectSupervisorSnapshot(project,{dataDir:root,missionRoot:root})
    expect(result.counts.review).toBe(1)
    expect(result.counts.followup).toBe(1)
    const other=await getProjectSupervisorSnapshot(join(root,'other'),{dataDir:root,missionRoot:root})
    expect(other.findings).toHaveLength(0)
  }finally{await rm(root,{recursive:true,force:true})}
})
