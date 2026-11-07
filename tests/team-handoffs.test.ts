import { expect, test } from 'bun:test'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  recordTeamHandoff,deliverTeamHandoff,changeTeamHandoff,listTeamHandoffs,
} from '../src/services/agentCenter/teamHandoffs.js'

const base={
  teamName:'视频团队',from:'策划',to:'剪辑',summary:'脚本已提交请制作视频',
  instruction:'使用确认后的分镜脚本、素材和配音制作最终完整视频，并提交可播放成果供复核',
  inputRefs:['artifact:script:v3'],
}
async function fixture(fn:(root:string,project:string)=>Promise<void>){
  const root=await mkdtemp(join(tmpdir(),'team-handoff-'))
  try{await fn(root,join(root,'project'))}finally{await rm(root,{recursive:true,force:true})}
}
test('持久交接按真实确认与验收阶段流转',async()=>{
  await fixture(async(root,project)=>{
    const id=randomUUID()
    const initial=await recordTeamHandoff(project,{...base,id},root)
    expect(initial.status).toBe('draft')
    const sent:string[]=[]
    const queued=await deliverTeamHandoff(project,id,async item=>{sent.push(item.id)},root)
    expect(sent).toEqual([id]);expect(queued.status).toBe('queued')
    expect((await deliverTeamHandoff(project,id,async()=>{throw new Error('不应重复投递')},root)).status).toBe('queued')
    await expect(changeTeamHandoff(project,id,'acknowledged','其他人',{},root)).rejects.toThrow('只有接收者')
    await changeTeamHandoff(project,id,'acknowledged',base.to,{},root)
    await changeTeamHandoff(project,id,'running',base.to,{},root)
    await expect(changeTeamHandoff(project,id,'review',base.to,{},root)).rejects.toThrow('真实成果')
    await changeTeamHandoff(project,id,'review',base.to,{outputRefs:['artifact:video:final']},root)
    await expect(changeTeamHandoff(project,id,'completed',base.from,{},root)).rejects.toThrow('核对结论')
    const done=await changeTeamHandoff(project,id,'completed',base.from,{reviewSummary:'核对了导出视频、画面同步和字幕内容'},root)
    expect(done.status).toBe('completed')
    expect(done.outputRefs).toContain('artifact:video:final')
    expect((await listTeamHandoffs(project,root))[0]?.reviewSummary).toContain('字幕')
  })
})
test('同一交接编号并发去重，内容冲突拒绝，项目隔离',async()=>{
  await fixture(async(root,project)=>{
    const id=randomUUID()
    const records=await Promise.all([1,2,3].map(()=>recordTeamHandoff(project,{...base,id},root)))
    expect(new Set(records.map(x=>x.id)).size).toBe(1)
    expect(await listTeamHandoffs(join(root,'other-project'),root)).toHaveLength(0)
    await expect(recordTeamHandoff(project,{...base,id,summary:'变更后的不一致描述'},root)).rejects.toThrow('冲突')
    expect(await listTeamHandoffs(project,root)).toHaveLength(1)
  })
})
test('交接传输失败保留待投递状态，重试沿用原始消息编号',async()=>{
  await fixture(async(root,project)=>{
    const id=randomUUID()
    await recordTeamHandoff(project,{...base,id},root)
    await expect(deliverTeamHandoff(project,id,async()=>{throw new Error('收件箱暂不可用')},root)).rejects.toThrow('收件箱')
    expect((await listTeamHandoffs(project,root))[0]?.status).toBe('draft')
    const sent:string[]=[]
    await deliverTeamHandoff(project,id,async item=>{sent.push(item.id)},root)
    expect(sent).toEqual([id])
    await expect(changeTeamHandoff(project,id,'review',base.to,{outputRefs:['artifact:a']},root)).rejects.toThrow('前置条件')
  })
})
