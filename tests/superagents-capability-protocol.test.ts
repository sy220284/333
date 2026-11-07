import { expect, test } from 'bun:test'
import { randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDesktopGateway } from '../src/services/desktop/gateway.js'
import { DesktopRequestSchema } from '../src/services/desktop/protocol.js'

const skill = {
  slug: 'agent-brief-maker',
  description: '面向项目目标编写可验证的研究工作概要',
  instructions: '## 适用条件\n收到需要调研的项目目标时，先确认范围和资料来源，再组织证据及未知事项。每项结论标注来源，最后提供复核办法，形成可以编辑的完整交付物。',
}
const experience = {
  key: 'research-source-check',
  title: '研究资料来源复核规范',
  scenario: '研究报告存在多个相互矛盾的资料来源且需要形成明确结论',
  principle: '每个核心结论都必须关联可独立核验的原始来源及来源日期',
  procedure: ['先记录资料原始来源和发布时间', '交叉核对关键事实并标注冲突及不确定性'],
  applicability: '需要追溯证据的研究与分析任务',
  invalidWhen: '仅进行用户明确要求的纯创意构思',
  verification: '检查每条重要结论的原始来源链接或档案编号',
  evidenceRefs: ['artifact:research-evidence-reviewed'],
  tags: ['研究', '来源核验'],
}
test('桌面协议拒绝非法技能输入并保留经验批准边界', async () => {
  expect(DesktopRequestSchema.safeParse({
    id:randomUUID(),method:'capabilities.skills.createDraft',...skill,slug:'../escape',
  }).success).toBe(false)
  expect(DesktopRequestSchema.safeParse({
    id:randomUUID(),method:'experience.approve',experienceId:'invalid',reviewer:'用户',
  }).success).toBe(false)
})
test('桌面原生接口贯通技能候选、人工发布、经验提炼与核验',async()=>{
  const root=await mkdtemp(join(tmpdir(),'desktop-capabilities-'))
  const project=join(root,'workspace')
  await mkdir(project)
  let launched=0
  const gateway=createDesktopGateway({cwd:project,dataDir:root,createSession:()=>{
    launched+=1
    throw new Error('只读工作不应自动启动模型')
  }})
  const req=(method:string,fields:Record<string,unknown>={})=>
    DesktopRequestSchema.parse({id:randomUUID(),method,...fields})
  try{
    const draft=await gateway.handle(req('capabilities.skills.createDraft',skill)) as {id:string;state:string}
    expect(draft.state).toBe('candidate')
    const list=await gateway.handle(req('capabilities.skills.drafts')) as {drafts:Array<{id:string;state:string}>}
    expect(list.drafts[0]?.id).toBe(draft.id)
    const published=await gateway.handle(req('capabilities.skills.publish',{draftId:draft.id})) as {path:string}
    expect(await readFile(published.path,'utf8')).toContain('name: agent-brief-maker')
    const discovered=await gateway.handle(req('capabilities.refresh')) as {items:Array<{name:string;kind:string}>;warnings:string[]}
    expect(discovered.items.some(item=>item.name==='agent-brief-maker'&&item.kind==='skill')).toBe(true)
    await expect(gateway.handle(req('capabilities.skills.publish',{draftId:randomUUID()}))).rejects.toThrow()
    const proposed=await gateway.handle(req('experience.propose',{draft:experience})) as {id:string;status:string}
    expect(proposed.status).toBe('candidate')
    const initially=await gateway.handle(req('experience.search',{query:'研究'})) as {experiences:unknown[]}
    expect(initially.experiences).toHaveLength(0)
    await gateway.handle(req('experience.approve',{experienceId:proposed.id,reviewer:'桌面用户'}))
    const approved=await gateway.handle(req('experience.search',{query:'研究'})) as {experiences:Array<{key:string}>}
    expect(approved.experiences[0]?.key).toBe('research-source-check')
    const handoffId=randomUUID()
    await expect(gateway.handle(req('handoffs.create',{
      requestId:handoffId,teamName:'missing-team',to:'设计',
      summary:'交接视觉规范',instruction:'根据已经审定的文案与素材检查视觉版式，并提供最终成果',
      inputRefs:[],
    }))).rejects.toThrow('团队')
    const pending=await gateway.handle(req('handoffs.list')) as {handoffs:Array<{id:string;status:string}>}
    expect(pending.handoffs.find(item=>item.id===handoffId)?.status).toBe('draft')
    await expect(gateway.handle(req('handoffs.retry',{handoffId}))).rejects.toThrow('团队')
    expect((await gateway.handle(req('handoffs.list')) as {handoffs:unknown[]}).handoffs).toHaveLength(1)
    await expect(gateway.handle(req('agents.profiles.bindSession', {
      agentId: randomUUID(), roleId: randomUUID(), sessionId: randomUUID(),
    }))).rejects.toThrow('not open')
    await expect(gateway.handle(req('handoffs.approve', {
      handoffId, reviewSummary:'已核对所有产物与实际内容，无遗漏',
    }))).rejects.toThrow('前置条件')
    expect(launched).toBe(0)
  }finally{
    await gateway.close()
    await rm(root,{recursive:true,force:true})
  }
})
