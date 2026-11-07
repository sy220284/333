import { expect,test } from 'bun:test'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAgentProfile,listAgentProfiles,assignAgentRole,releaseAgentRole,bindAgentProfileSession,
  updateAgentProfileStatus } from '../src/services/agentCenter/agentRegistry.js'

async function fixture(fn:(root:string,project:string)=>Promise<void>){
  const root=await mkdtemp(join(tmpdir(),'agent-profiles-'))
  try{await fn(root,join(root,'project'))}finally{await rm(root,{recursive:true,force:true})}
}
const defaultProfile=(id:string)=>({
  id,name:'通用创作成员',description:'承担调研与文字创作任务并保留工作经验',
  domains:['调研','文案'],capabilityIds:['skill:report-research'],experienceKeys:[],
})
test('长期身份持久化、同号幂等与不同项目隔离',async()=>{
  await fixture(async(root,project)=>{
    const id=randomUUID()
    const first=await createAgentProfile(project,defaultProfile(id),root)
    expect((await createAgentProfile(project,defaultProfile(id),root)).id).toBe(first.id)
    expect((await listAgentProfiles(project,root))[0]?.name).toBe('通用创作成员')
    expect(await listAgentProfiles(join(root,'other'),root)).toHaveLength(0)
    await expect(createAgentProfile(project,{...defaultProfile(randomUUID()),name:first.name},root))
      .rejects.toThrow('同名')
    await expect(createAgentProfile(project,{...defaultProfile(id),domains:['开发']},root))
      .rejects.toThrow('配置发生冲突')
  })
})
test('同一长期身份动态切换职责，保留完整角色历史',async()=>{
  await fixture(async(root,project)=>{
    const person=await createAgentProfile(project,defaultProfile(randomUUID()),root)
    const first=await assignAgentRole(project,person.id,{
      teamName:'内容团队',missionId:'mission-video',role:'文案',purpose:'写出视频脚本并提供文字结构',
    },root)
    expect(first.roles[0]?.state).toBe('active')
    expect((await assignAgentRole(project,person.id,{
      teamName:'内容团队',missionId:'mission-video',role:'文案',purpose:'写出视频脚本并提供文字结构',
    },root)).revision).toBe(first.revision)
    const changed=await assignAgentRole(project,person.id,{
      teamName:'内容团队',missionId:'mission-video',role:'调研',purpose:'验证新资料来源并修订选题策略',
    },root)
    expect(changed.roles).toHaveLength(2)
    expect(changed.roles[0]?.state).toBe('released')
    expect(changed.roles[1]?.state).toBe('active')
    await expect(updateAgentProfileStatus(project,person.id,'retired',root)).rejects.toThrow('在岗职责')
    const released=await releaseAgentRole(project,person.id,changed.roles[1]?.id ?? '',root)
    expect(released.roles[1]?.state).toBe('released')
    await updateAgentProfileStatus(project,person.id,'retired',root)
    expect((await listAgentProfiles(project,root))[0]?.status).toBe('retired')
  })
})
test('并发注册同一身份只存一份',async()=>{
  await fixture(async(root,project)=>{
    const draft=defaultProfile(randomUUID())
    const profiles=await Promise.all([1,2,3,4].map(()=>createAgentProfile(project,draft,root)))
    expect(new Set(profiles.map(p=>p.id)).size).toBe(1)
    expect((await listAgentProfiles(project,root))).toHaveLength(1)
  })
})

test('稳定身份绑定真实会话，重复绑定幂等且避免两个角色混用', async () => {
  await fixture(async (root, project) => {
    const first = await createAgentProfile(project, defaultProfile(randomUUID()), root)
    const role = (await assignAgentRole(project, first.id, {
      role:'文案', purpose:'完成文章结构和可核验稿件',
    },root)).roles[0]
    if(!role)throw new Error('缺失已配置角色')
    const sessionId = randomUUID()
    const linked = await bindAgentProfileSession(project,first.id,role.id,sessionId,root)
    expect(linked.sessionBindings).toHaveLength(1)
    expect((await bindAgentProfileSession(project,first.id,role.id,sessionId,root)).revision)
      .toBe(linked.revision)
    await releaseAgentRole(project,first.id,role.id,root)
    const secondRole = (await assignAgentRole(project,first.id,{
      role:'审校',purpose:'检查文章引用资料和读者理解',
    },root)).roles.at(-1)
    if(!secondRole)throw new Error('缺失新角色')
    await expect(bindAgentProfileSession(project,first.id,secondRole.id,sessionId,root))
      .rejects.toThrow('历史身份混淆')
    const second = await createAgentProfile(project,{
      ...defaultProfile(randomUUID()),name:'独立审校成员',
    },root)
    const otherRole = (await assignAgentRole(project,second.id,{
      role:'审校',purpose:'独立核对文章事实与数据',
    },root)).roles[0]
    if(!otherRole)throw new Error('缺失第二名成员角色')
    await expect(bindAgentProfileSession(project,second.id,otherRole.id,sessionId,root))
      .rejects.toThrow('另一长期身份')
    expect((await listAgentProfiles(project,root))[0]?.sessionBindings[0]?.sessionId).toBe(sessionId)
  })
})
