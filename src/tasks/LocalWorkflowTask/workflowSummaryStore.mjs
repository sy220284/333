import { mkdir,readFile,rename,rm,writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
/** Atomic per-run JSON snapshot; readers never observe a half-written record. */
export async function writeWorkflowSummary(path,record){
 if(typeof path!=='string'||!path.endsWith('.json')||!record||typeof record!=='object')
   throw new Error('Invalid workflow summary write')
 const data=JSON.stringify(record)+'\n'
 const temporary=path+'.tmp-'+randomUUID()
 await mkdir(dirname(path),{recursive:true,mode:0o700})
 try{
  await writeFile(temporary,data,{flag:'wx',mode:0o600})
  await rename(temporary,path)
 }catch(error){
  await rm(temporary,{force:true})
  throw error
 }
}
export async function readWorkflowSummary(path){
 const value=JSON.parse(await readFile(path,'utf8'))
 if(!value||typeof value!=='object'||typeof value.runId!=='string'||typeof value.scriptPath!=='string')
  throw new Error('Invalid workflow summary on disk')
 return value
}
