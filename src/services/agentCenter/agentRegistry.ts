/**
 * Long-lived local agent identities. Runtime SDK sessions and temporary Team
 * members bind to profiles; a profile survives team shutdown and role changes.
 */
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { z } from 'zod/v4'
import * as lockfile from '../../utils/lockfile.js'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'

const roleSchema=z.strictObject({
  id:z.string().uuid(),
  missionId:z.string().min(1).max(160).optional(),
  teamName:z.string().trim().min(1).max(128).optional(),
  role:z.string().trim().min(2).max(100),
  purpose:z.string().trim().min(8).max(1000),
  state:z.enum(['active','released']),
  assignedAt:z.string().datetime(),
  releasedAt:z.string().datetime().optional(),
})
const bindingSchema = z.strictObject({
  sessionId: z.string().uuid(),
  roleId: z.string().uuid(),
  boundAt: z.string().datetime(),
})
export type AgentSessionBinding = z.infer<typeof bindingSchema>
const profileSchema=z.strictObject({
  id:z.string().uuid(),
  name:z.string().trim().min(2).max(100),
  description:z.string().trim().min(8).max(1000),
  domains:z.array(z.string().trim().min(2).max(80)).min(1).max(20),
  capabilityIds:z.array(z.string().trim().min(3).max(200)).max(100),
  experienceKeys:z.array(z.string().regex(/^[a-z0-9][a-z0-9._-]{2,95}$/)).max(100),
  status:z.enum(['available','paused','retired']),
  roles:z.array(roleSchema).max(300),
  sessionBindings:z.array(bindingSchema).max(300).default([]),
  revision:z.number().int().nonnegative(),
  createdAt:z.string().datetime(),
  updatedAt:z.string().datetime(),
})
const documentSchema=z.strictObject({
  version:z.literal(1),
  projectDir:z.string().min(1),
  revision:z.number().int().nonnegative(),
  agents:z.array(profileSchema).max(150),
})
export type AgentProfile=z.infer<typeof profileSchema>
export type AgentRole=z.infer<typeof roleSchema>
export type AgentProfileInput={
  id:string;name:string;description:string;domains:string[];
  capabilityIds?:string[];experienceKeys?:string[]
}
type Doc=z.infer<typeof documentSchema>
function filePath(projectDir:string,root:string):string {
  if(!projectDir.trim())throw new Error('长期智能体必须绑定项目')
  return join(root,'agent-profiles',
    `${createHash('sha256').update(resolve(projectDir)).digest('hex')}.json`)
}
function blank(projectDir:string):Doc {
  return {version:1,projectDir:resolve(projectDir),revision:0,agents:[]}
}
async function readDoc(projectDir:string,root:string):Promise<Doc>{
  const path=filePath(projectDir,root)
  let raw:string
  try{raw=await readFile(path,'utf8')}
  catch(error){
    if((error as NodeJS.ErrnoException).code==='ENOENT')return blank(projectDir)
    throw error
  }
  if(Buffer.byteLength(raw)>4_000_000)throw new Error('智能体档案超过容量限制')
  const doc=documentSchema.parse(JSON.parse(raw))
  if(doc.projectDir!==resolve(projectDir))throw new Error('智能体档案归属其他项目')
  return doc
}
async function change(
  projectDir:string,root:string,fn:(doc:Doc)=>{doc:Doc;profile:AgentProfile},
):Promise<AgentProfile>{
  const path=filePath(projectDir,root)
  await mkdir(join(root,'agent-profiles'),{recursive:true,mode:0o700})
  try{await writeFile(path,JSON.stringify(blank(projectDir)),{flag:'wx',mode:0o600})}
  catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error}
  const unlock=await lockfile.lock(path,{retries:{retries:8,minTimeout:25,maxTimeout:250}})
  try{
    const before=await readDoc(projectDir,root)
    const {doc,profile}=fn(before)
    if(doc===before)return profile
    const updated=documentSchema.parse({...doc,revision:before.revision+1})
    const raw=JSON.stringify(updated,null,2)
    if(Buffer.byteLength(raw)>4_000_000)throw new Error('智能体档案超过容量限制')
    const temp=`${path}.${randomUUID()}.tmp`
    try{await writeFile(temp,raw,{flag:'wx',mode:0o600});await rename(temp,path)}
    finally{await rm(temp,{force:true})}
    return profile
  }finally{await unlock()}
}
export async function listAgentProfiles(projectDir:string,root=getClaudeConfigHomeDir()):Promise<AgentProfile[]>{
  return (await readDoc(projectDir,root)).agents
}
export async function createAgentProfile(
  projectDir:string,input:AgentProfileInput,root=getClaudeConfigHomeDir(),
):Promise<AgentProfile>{
  const parsed=z.strictObject({
    id:z.string().uuid(),name:profileSchema.shape.name,description:profileSchema.shape.description,
    domains:profileSchema.shape.domains,
    capabilityIds:profileSchema.shape.capabilityIds.optional(),
    experienceKeys:profileSchema.shape.experienceKeys.optional(),
  }).parse(input)
  return change(projectDir,root,doc=>{
    const prior=doc.agents.find(p=>p.id===parsed.id)
    if(prior){
      const original={
        id:prior.id,name:prior.name,description:prior.description,
        domains:prior.domains,capabilityIds:prior.capabilityIds,experienceKeys:prior.experienceKeys,
      }
      const wanted={...parsed,capabilityIds:parsed.capabilityIds??[],experienceKeys:parsed.experienceKeys??[]}
      if(JSON.stringify(original)!==JSON.stringify(wanted))throw new Error('同一智能体身份编号的配置发生冲突')
      return {doc,profile:prior}
    }
    if(doc.agents.some(p=>p.name.toLowerCase()===parsed.name.toLowerCase()&&p.status!=='retired'))
      throw new Error('当前项目已经存在同名长期智能体')
    if(doc.agents.length>=150)throw new Error('当前项目长期智能体数量超过上限')
    const now=new Date().toISOString()
    const profile=profileSchema.parse({
      ...parsed,capabilityIds:parsed.capabilityIds??[],experienceKeys:parsed.experienceKeys??[],
      roles:[],sessionBindings:[],status:'available',revision:0,createdAt:now,updatedAt:now,
    })
    return {doc:{...doc,agents:[...doc.agents,profile]},profile}
  })
}
export async function assignAgentRole(
  projectDir:string,agentId:string,
  data:{role:string;purpose:string;missionId?:string;teamName?:string},
  root=getClaudeConfigHomeDir(),
):Promise<AgentProfile>{
  const request=z.strictObject({
    role:roleSchema.shape.role,purpose:roleSchema.shape.purpose,
    missionId:roleSchema.shape.missionId,teamName:roleSchema.shape.teamName,
  }).parse(data)
  if(!z.string().uuid().safeParse(agentId).success)throw new Error('智能体身份 ID 无效')
  return change(projectDir,root,doc=>{
    const profile=doc.agents.find(p=>p.id===agentId)
    if(!profile)throw new Error('长期智能体不存在')
    if(profile.status!=='available')throw new Error('仅可调配处于可用状态的长期智能体')
    const current=profile.roles.find(r=>r.state==='active'&&
      r.missionId===request.missionId&&r.teamName===request.teamName)
    if(current&&current.role===request.role&&current.purpose===request.purpose)return {doc,profile}
    const now=new Date().toISOString()
    const roles=profile.roles.map(r=>r===current?{...r,state:'released' as const,releasedAt:now}:r)
    roles.push(roleSchema.parse({
      id:randomUUID(),...request,state:'active',assignedAt:now,
    }))
    const updated=profileSchema.parse({...profile,roles,
      revision:profile.revision+1,updatedAt:now})
    return {doc:{...doc,agents:doc.agents.map(p=>p.id===agentId?updated:p)},profile:updated}
  })
}
export async function updateAgentProfileStatus(
  projectDir:string,agentId:string,status:'available'|'paused'|'retired',
  root=getClaudeConfigHomeDir(),
):Promise<AgentProfile>{
  return change(projectDir,root,doc=>{
    const profile=doc.agents.find(p=>p.id===agentId)
    if(!profile)throw new Error('长期智能体不存在')
    if(profile.status===status)return {doc,profile}
    if(profile.status==='retired')throw new Error('已退役身份需要重新注册，不能直接恢复')
    if(status==='retired'&&profile.roles.some(r=>r.state==='active'))
      throw new Error('请先解除长期智能体的在岗职责再退役')
    const now=new Date().toISOString()
    const updated=profileSchema.parse({...profile,status,revision:profile.revision+1,updatedAt:now})
    return {doc:{...doc,agents:doc.agents.map(p=>p.id===agentId?updated:p)},profile:updated}
  })
}
export async function releaseAgentRole(
  projectDir:string,agentId:string,roleId:string,root=getClaudeConfigHomeDir(),
):Promise<AgentProfile>{
  return change(projectDir,root,doc=>{
    const profile=doc.agents.find(p=>p.id===agentId)
    if(!profile)throw new Error('长期智能体不存在')
    const role=profile.roles.find(r=>r.id===roleId)
    if(!role)throw new Error('需要解除的角色不存在')
    if(role.state==='released')return {doc,profile}
    const now=new Date().toISOString()
    const roles=profile.roles.map(r=>r.id===roleId?{...r,state:'released' as const,releasedAt:now}:r)
    const updated=profileSchema.parse({...profile,roles,revision:profile.revision+1,updatedAt:now})
    return {doc:{...doc,agents:doc.agents.map(p=>p.id===agentId?updated:p)},profile:updated}
  })
}

/** A durable identity-to-session reference, never an implicit SDK launch. */
export async function bindAgentProfileSession(
  projectDir: string, agentId: string, roleId: string, sessionId: string,
  root = getClaudeConfigHomeDir(),
): Promise<AgentProfile> {
  const uuid = z.string().uuid()
  uuid.parse(agentId); uuid.parse(roleId); uuid.parse(sessionId)
  return change(projectDir, root, doc => {
    const profile = doc.agents.find(item => item.id === agentId)
    if (!profile) throw new Error('长期智能体身份不存在')
    if (profile.status !== 'available') throw new Error('长期身份暂停或退役，暂不可绑定新会话')
    if (!profile.roles.some(role => role.id === roleId && role.state === 'active'))
      throw new Error('必须绑定该智能体当前在岗职责')
    const owner = doc.agents.find(item =>
      item.sessionBindings.some(binding => binding.sessionId === sessionId))
    if (owner && owner.id !== agentId)
      throw new Error('原生会话已关联另一长期身份，须先核对归属')
    const previous = profile.sessionBindings.find(binding => binding.sessionId === sessionId)
    if (previous) {
      if (previous.roleId !== roleId) throw new Error('原生会话已绑定其他职责，避免历史身份混淆')
      return { doc, profile }
    }
    if (profile.sessionBindings.length >= 300) throw new Error('该智能体会话历史已达到容量上限')
    const timestamp = new Date().toISOString()
    const updated = profileSchema.parse({
      ...profile,
      sessionBindings: [...profile.sessionBindings, { sessionId, roleId, boundAt: timestamp }],
      revision: profile.revision + 1,
      updatedAt: timestamp,
    })
    return {
      doc: { ...doc, agents: doc.agents.map(item => item.id === agentId ? updated : item) },
      profile: updated,
    }
  })
}
