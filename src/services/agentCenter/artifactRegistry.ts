/**
 * Durable content-addressed artifact index for project deliverables.
 * A registered file has been hashed, but only explicit review marks it accepted.
 */
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { z } from 'zod/v4'
import * as lockfile from '../../utils/lockfile.js'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'

const category=z.enum(['video','image','audio','document','code','other'])
const itemSchema=z.strictObject({
  id:z.string().uuid(),title:z.string().trim().min(4).max(200),
  kind:category,path:z.string().trim().min(1).max(2048),
  sha256:z.string().regex(/^[0-9a-f]{64}$/),
  byteSize:z.number().int().nonnegative(),version:z.number().int().positive(),
  status:z.enum(['registered','approved','superseded']),
  createdAt:z.string().datetime(),verifiedAt:z.string().datetime().optional(),
  reviewer:z.string().trim().min(2).max(128).optional(),
  reviewNote:z.string().trim().min(16).max(1500).optional(),
  missionId:z.string().regex(/^mission_[a-f0-9]{16}$/).optional(),
  jobId:z.string().regex(/^job_[a-f0-9]{16}$/).optional(),
})
const docSchema=z.strictObject({
  version:z.literal(1),projectDir:z.string().min(1),
  revision:z.number().int().nonnegative(),artifacts:z.array(itemSchema).max(1500),
})
export type ProjectArtifact=z.infer<typeof itemSchema>
type Doc=z.infer<typeof docSchema>
export type ArtifactInput={
  title:string,kind:ProjectArtifact['kind'],path:string,missionId?:string,jobId?:string
}
function catalogPath(projectDir:string,root:string):string {
  if(!projectDir.trim())throw new Error('成果必须属于明确的项目')
  const key=createHash('sha256').update(resolve(projectDir)).digest('hex')
  return join(root,'artifact-catalog',key.concat('.json'))
}
function empty(projectDir:string):Doc {
  return {version:1,projectDir:resolve(projectDir),revision:0,artifacts:[]}
}
async function read(projectDir:string,root:string):Promise<Doc>{
  let raw:string
  try{raw=await readFile(catalogPath(projectDir,root),'utf8')}
  catch(error){
    if((error as NodeJS.ErrnoException).code==='ENOENT')return empty(projectDir)
    throw error
  }
  if(Buffer.byteLength(raw)>8_000_000)throw new Error('成果目录容量超过限制')
  const doc=docSchema.parse(JSON.parse(raw))
  if(doc.projectDir!==resolve(projectDir))throw new Error('成果索引归属其他项目')
  return doc
}
async function modify<T>(
  projectDir:string,root:string,transform:(doc:Doc)=>{doc:Doc;item:T},
):Promise<T>{
  const path=catalogPath(projectDir,root)
  await mkdir(join(root,'artifact-catalog'),{recursive:true,mode:0o700})
  try{await writeFile(path,JSON.stringify(empty(projectDir)),{flag:'wx',mode:0o600})}
  catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error}
  const release=await lockfile.lock(path,{retries:{retries:8,minTimeout:25,maxTimeout:250}})
  try{
    const doc=await read(projectDir,root)
    const change=transform(doc)
    if(change.doc===doc)return change.item
    const updated=docSchema.parse({...change.doc,revision:doc.revision+1})
    const raw=JSON.stringify(updated,null,2)
    if(Buffer.byteLength(raw)>8_000_000)throw new Error('成果目录容量超过限制')
    const temp=[path,randomUUID(),'tmp'].join('.')
    try{await writeFile(temp,raw,{flag:'wx',mode:0o600});await rename(temp,path)}
    finally{await rm(temp,{force:true})}
    return change.item
  }finally{await release()}
}
async function checkedPath(projectDir:string,given:string):Promise<{file:string;rel:string}>{
  if(!given.trim()||isAbsolute(given)||/^[A-Za-z]:/.test(given)||
     given.split(/[\\/]/).includes('..'))
    throw new Error('成果路径必须是当前项目内的相对路径')
  const project=await realpath(projectDir)
  const file=await realpath(resolve(project,given))
  const rel=relative(project,file)
  if(!rel||rel==='..'||rel.startsWith(['..',sep].join(''))||isAbsolute(rel))
    throw new Error('成果文件超出当前项目范围')
  return {file,rel}
}
async function digest(file:string):Promise<{sha256:string;byteSize:number}>{
  const before=await stat(file)
  if(!before.isFile()||before.size>16*1024*1024*1024)
    throw new Error('成果必须为不超过16GB的普通文件')
  const hash=createHash('sha256')
  let byteSize=0
  for await(const chunk of createReadStream(file)){
    hash.update(chunk)
    byteSize+=(chunk as Buffer).byteLength
  }
  const after=await stat(file)
  if(before.size!==after.size||before.mtimeMs!==after.mtimeMs||byteSize!==after.size)
    throw new Error('文件在登记过程中发生修改，请重新核验')
  return {sha256:hash.digest('hex'),byteSize}
}
export async function listProjectArtifacts(
  projectDir:string,root=getClaudeConfigHomeDir(),
):Promise<ProjectArtifact[]>{
  return (await read(projectDir,root)).artifacts
}
export async function registerProjectArtifact(
  projectDir:string,input:ArtifactInput,root=getClaudeConfigHomeDir(),
):Promise<ProjectArtifact>{
  const checked=z.strictObject({
    title:itemSchema.shape.title,kind:category,path:itemSchema.shape.path,
    missionId:itemSchema.shape.missionId,jobId:itemSchema.shape.jobId,
  }).parse(input)
  const {file,rel}=await checkedPath(projectDir,checked.path)
  const {sha256,byteSize}=await digest(file)
  return modify(projectDir,root,doc=>{
    const previous=doc.artifacts.filter(item=>item.path===rel)
    const duplicate=previous.find(item=>item.status!=='superseded'&&item.sha256===sha256&&
      item.title===checked.title&&item.kind===checked.kind)
    if(duplicate)return {doc,item:duplicate}
    if(doc.artifacts.length>=1500)throw new Error('成果目录已满，请归档历史成果')
    const artifact=itemSchema.parse({
      ...checked,path:rel,id:randomUUID(),sha256,byteSize,
      status:'registered',version:Math.max(0,...previous.map(item=>item.version))+1,
      createdAt:new Date().toISOString(),
    })
    return {doc:{...doc,artifacts:[
      ...doc.artifacts.map(item=>item.path===rel?{...item,status:'superseded' as const}:item),
      artifact,
    ]},item:artifact}
  })
}
export async function verifyProjectArtifact(
  projectDir:string,id:string,root=getClaudeConfigHomeDir(),
):Promise<{artifact:ProjectArtifact;matches:boolean;actualSha256:string}>{
  z.string().uuid().parse(id)
  const item=(await listProjectArtifacts(projectDir,root)).find(item=>item.id===id)
  if(!item)throw new Error('成果未在当前项目登记')
  const {file}=await checkedPath(projectDir,item.path)
  const current=await digest(file)
  return {artifact:item,matches:item.sha256===current.sha256&&
    item.byteSize===current.byteSize,actualSha256:current.sha256}
}
export async function approveProjectArtifact(
  projectDir:string,id:string,reviewer:string,reviewNote:string,
  root=getClaudeConfigHomeDir(),
):Promise<ProjectArtifact>{
  const name=itemSchema.shape.reviewer.unwrap().parse(reviewer)
  const note=itemSchema.shape.reviewNote.unwrap().parse(reviewNote)
  const current=await verifyProjectArtifact(projectDir,id,root)
  if(!current.matches)throw new Error('成果文件发生变化，需重新登记真实版本')
  return modify(projectDir,root,doc=>{
    const record=doc.artifacts.find(item=>item.id===id)
    if(!record||record.sha256!==current.artifact.sha256)
      throw new Error('审核期间索引版本发生变化')
    if(record.status==='superseded')throw new Error('历史版本已被替换，无法再次批准')
    if(record.status==='approved')return {doc,item:record}
    const item=itemSchema.parse({
      ...record,status:'approved',reviewer:name,reviewNote:note,verifiedAt:new Date().toISOString(),
    })
    return {doc:{...doc,artifacts:doc.artifacts.map(value=>value.id===id?item:value)},item}
  })
}
