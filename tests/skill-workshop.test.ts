import { expect, test } from 'bun:test'
import { mkdtemp, mkdir, readFile, readdir, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSkillDraft, listSkillDrafts, publishSkillDraft } from '../src/services/agentCenter/skillWorkshop.js'

const input = {
  slug: 'subtitle-timebase',
  description: '核对视频剪辑后字幕的时间基准并生成验证报告',
  instructions: '## 适用场景\n用于字幕时间轴与剪辑时间基准不一致的素材。先检查源视频元数据，随后分析字幕时间戳，按统一时基校正，再抽样核查。必须保存实际导出的验收文件及处理日志。',
}
async function fixture(fn: (root:string,project:string)=>Promise<void>) {
  const root=await mkdtemp(join(tmpdir(),'skill-workshop-'))
  const project=join(root,'project')
  await mkdir(project)
  try { await fn(root,project) }
  finally { await rm(root,{recursive:true,force:true}) }
}
test('候选持久化且发布需要明确操作，发布结果可用于原生技能目录',async()=>{
  await fixture(async(root,project)=>{
    const saved=await createSkillDraft(project,input,root)
    expect(saved.state).toBe('candidate')
    expect((await listSkillDrafts(project,root))[0]?.id).toBe(saved.id)
    const installed=await publishSkillDraft(project,saved.id,root)
    expect(installed.draft.state).toBe('published')
    expect(await readFile(installed.path,'utf8')).toContain('name: subtitle-timebase')
    expect((await publishSkillDraft(project,saved.id,root)).path).toBe(installed.path)
  })
})
test('拒绝非法名称、描述换行与内容过短',async()=>{
  await fixture(async(root,project)=>{
    await expect(createSkillDraft(project,{...input,slug:'../bad'},root)).rejects.toThrow()
    await expect(createSkillDraft(project,{...input,description:'注入\n执行：失控'},root)).rejects.toThrow()
    await expect(createSkillDraft(project,{...input,instructions:'过短'},root)).rejects.toThrow()
  })
})
test('保护已有技能文件，避免覆盖',async()=>{
  await fixture(async(root,project)=>{
    const saved=await createSkillDraft(project,input,root)
    const skill=join(project,'.claude','skills',input.slug)
    await mkdir(skill,{recursive:true})
    await Bun.write(join(skill,'SKILL.md'),'已存在的旧版本')
    await expect(publishSkillDraft(project,saved.id,root)).rejects.toThrow('不同内容')
  })
})
test('阻止技能目录软链接逃逸项目',async()=>{
  await fixture(async(root,project)=>{
    const saved=await createSkillDraft(project,input,root)
    const target=join(root,'outside')
    await mkdir(target)
    await mkdir(join(project,'.claude'),{recursive:true})
    await symlink(target,join(project,'.claude','skills'))
    await expect(publishSkillDraft(project,saved.id,root)).rejects.toThrow('超出了项目范围')
    expect(await readdir(target)).toHaveLength(0)
  })
})
