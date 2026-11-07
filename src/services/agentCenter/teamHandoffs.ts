/**
 * Project-wide, durable cross-team handoff ledger.
 * The native Team Mailbox remains the message transport; this ledger holds
 * dependency/receipt state. A queued handoff only proves mailbox persistence.
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join, resolve } from 'node:path'
import { z } from 'zod/v4'
import * as lockfile from '../../utils/lockfile.js'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'

const actor = z.string().trim().min(1).max(128)
const handoffSchema = z.strictObject({
  id: z.string().uuid(),
  teamName: actor,
  from: actor,
  to: actor,
  summary: z.string().trim().min(5).max(200),
  instruction: z.string().trim().min(12).max(6000),
  taskId: z.string().min(1).max(200).optional(),
  inputRefs: z.array(z.string().trim().min(3).max(400)).max(30),
  outputRefs: z.array(z.string().trim().min(3).max(400)).max(30),
  status: z.enum(['draft','queued','acknowledged','running','review','completed','cancelled']),
  reviewSummary: z.string().min(10).max(1200).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  revision: z.number().int().nonnegative(),
})
const documentSchema = z.strictObject({
  version: z.literal(1),
  projectDir: z.string().min(1),
  revision: z.number().int().nonnegative(),
  handoffs: z.array(handoffSchema).max(2000),
})
export type Handoff = z.infer<typeof handoffSchema>
export type HandoffInput = Pick<Handoff,'id'|'teamName'|'from'|'to'|'summary'|'instruction'|'inputRefs'> &
  Partial<Pick<Handoff,'taskId'>>
export type HandoffAction = 'queued'|'acknowledged'|'running'|'review'|'completed'|'cancelled'
type Document = z.infer<typeof documentSchema>
function storage(projectDir: string, root: string): string {
  if (!projectDir.trim()) throw new Error('交接必须指定项目')
  return join(root,'agent-handoffs',
    createHash('sha256').update(resolve(projectDir)).digest('hex')+'.json')
}
function empty(projectDir:string):Document {
  return {version:1,projectDir:resolve(projectDir),revision:0,handoffs:[]}
}
async function read(projectDir:string,root:string):Promise<Document> {
  const path=storage(projectDir,root)
  let data:string
  try { data=await readFile(path,'utf8') }
  catch(error) {
    if((error as NodeJS.ErrnoException).code==='ENOENT')return empty(projectDir)
    throw error
  }
  if(Buffer.byteLength(data)>8_000_000)throw new Error('团队交接记录超过容量限制')
  const doc=documentSchema.parse(JSON.parse(data))
  if(doc.projectDir!==resolve(projectDir))throw new Error('交接记录属于其他项目')
  return doc
}
async function change(projectDir:string,root:string,transform:(doc:Document)=>{doc:Document;handoff:Handoff}):Promise<Handoff>{
  const path=storage(projectDir,root)
  await mkdir(join(root,'agent-handoffs'),{recursive:true,mode:0o700})
  try { await writeFile(path,JSON.stringify(empty(projectDir)),{flag:'wx',mode:0o600}) }
  catch(error) { if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error }
  const unlock=await lockfile.lock(path,{retries:{retries:8,minTimeout:25,maxTimeout:250}})
  try {
    const previous=await read(projectDir,root)
    const result=transform(previous)
    if(result.doc===previous)return result.handoff
    const next=documentSchema.parse({...result.doc,revision:previous.revision+1})
    const serialized=JSON.stringify(next,null,2)
    if(Buffer.byteLength(serialized)>8_000_000)throw new Error('团队交接记录超过容量限制')
    const tmp=path+'.'+randomUUID()+'.tmp'
    try { await writeFile(tmp,serialized,{flag:'wx',mode:0o600});await rename(tmp,path) }
    finally { await rm(tmp,{force:true}) }
    return result.handoff
  }finally{await unlock()}
}
export async function listTeamHandoffs(projectDir:string,root=getClaudeConfigHomeDir()):Promise<Handoff[]>{
  return (await read(projectDir,root)).handoffs
}
/** Caller supplies a stable request UUID so retries do not create new work. */
export async function recordTeamHandoff(
  projectDir:string,input:HandoffInput,root=getClaudeConfigHomeDir(),
):Promise<Handoff>{
  const data=z.strictObject({
    id:z.string().uuid(),teamName:actor,from:actor,to:actor,
    summary:handoffSchema.shape.summary,instruction:handoffSchema.shape.instruction,
    inputRefs:handoffSchema.shape.inputRefs,taskId:handoffSchema.shape.taskId,
  }).parse(input)
  if(data.from===data.to)throw new Error('交接收件人必须与发送者不同')
  return change(projectDir,root,doc=>{
    const existing=doc.handoffs.find(item=>item.id===data.id)
    if(existing){
      if([existing.teamName,existing.from,existing.to,existing.summary,existing.instruction,existing.taskId,JSON.stringify(existing.inputRefs)].join('|')!==
         [data.teamName,data.from,data.to,data.summary,data.instruction,data.taskId,JSON.stringify(data.inputRefs)].join('|'))
        throw new Error('同一交接编号的内容发生冲突')
      return {doc,handoff:existing}
    }
    if(doc.handoffs.length>=2000)throw new Error('交接记录达到容量上限，需要归档')
    const now=new Date().toISOString()
    const handoff:Handoff=handoffSchema.parse({
      ...data,status:'draft',revision:0,inputRefs:data.inputRefs,outputRefs:[],createdAt:now,updatedAt:now,
    })
    return {doc:{...doc,handoffs:[...doc.handoffs,handoff]},handoff}
  })
}
export async function changeTeamHandoff(
  projectDir:string,id:string,action:HandoffAction,performedBy:string,
  options:{outputRefs?:string[];reviewSummary?:string}={},
  root=getClaudeConfigHomeDir(),
):Promise<Handoff>{
  if(!z.string().uuid().safeParse(id).success)throw new Error('交接编号无效')
  const user=actor.parse(performedBy)
  const next:Record<HandoffAction,Handoff['status']> = {
    queued:'draft',acknowledged:'queued',running:'acknowledged',review:'running',
    completed:'review',cancelled:'draft',
  }
  return change(projectDir,root,doc=>{
    const before=doc.handoffs.find(item=>item.id===id)
    if(!before)throw new Error('交接记录不存在')
    if(before.status===action)return {doc,handoff:before}
    if(action==='cancelled'){
      if(before.status==='completed'||before.status==='cancelled')throw new Error('已完成交接无法取消')
      if(user!==before.from && user!=='team-lead')throw new Error('只有发送方或项目负责人可取消交接')
    }else if(before.status!==next[action]) {
      throw new Error('交接状态前置条件未满足：'+before.status+' → '+action)
    }
    if(action==='queued'&&user!==before.from)throw new Error('只有发送者能确认原生信箱投递')
    if(['acknowledged','running','review'].includes(action)&&user!==before.to)
      throw new Error('只有接收者才能认领、执行或交付')
    if(action==='completed'&&user!==before.from&&user!=='team-lead')
      throw new Error('只有负责人才能核验交付')
    if(action==='review'&&(!options.outputRefs||options.outputRefs.length===0))
      throw new Error('交付必须关联真实成果引用')
    if(action==='completed'&&(!options.reviewSummary||options.reviewSummary.trim().length<10))
      throw new Error('验收必须记录足够具体的核对结论')
    const result=handoffSchema.parse({
      ...before,status:action,revision:before.revision+1,updatedAt:new Date().toISOString(),
      ...(action==='review'?{outputRefs:options.outputRefs}:{}),
      ...(action==='completed'?{reviewSummary:options.reviewSummary}:{}),
    })
    return {doc:{...doc,handoffs:doc.handoffs.map(x=>x.id===id?result:x)},handoff:result}
  })
}
/**
 * Safe redelivery: record first, then native mailbox, then mark queued.
 * Mailbox uses the same stable message ID and deduplicates retries.
 */
export async function deliverTeamHandoff(
  projectDir:string,id:string,dispatch:(handoff:Handoff)=>Promise<unknown>,
  root=getClaudeConfigHomeDir(),
):Promise<Handoff>{
  const stored=(await listTeamHandoffs(projectDir,root)).find(x=>x.id===id)
  if(!stored)throw new Error('交接记录不存在')
  if(stored.status!=='draft')return stored
  await dispatch(stored)
  return changeTeamHandoff(projectDir,id,'queued',stored.from,{},root)
}
