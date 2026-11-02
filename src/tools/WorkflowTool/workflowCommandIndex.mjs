import { readdir,readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { workflowMeta } from './workflowRuntime.mjs'
export async function listWorkflowFiles(cwd,{onError}={}){
 const dir=join(cwd,'.claude','workflows')
 let entries
 try{entries=await readdir(dir,{withFileTypes:true})}
 catch(error){if(error?.code==='ENOENT')return [];throw error}
 const commands=[]
 for(const entry of entries){
  if(!entry.isFile()||!(/\.(mjs|js)$/.test(entry.name)))continue
  const file=join(dir,entry.name)
  try{
    const script=await readFile(file,'utf8')
    const meta=workflowMeta(script)
    commands.push({name:meta.name,description:meta.description,file})
  }catch(error){
    if(!onError)throw error
    onError({file,error})
  }
 }
 return commands.sort((a,b)=>a.name.localeCompare(b.name))
}
