import { readdir,readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { workflowMeta } from './workflowRuntime.ts'
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

/**
 * A named workflow is identified by the name in meta, not its disk basename.
 * Never silently select one of multiple definitions with the same name.
 */
export async function resolveNamedWorkflowFile(cwd,name){
 if(typeof name!=='string'||!/^[\w-]{1,80}$/.test(name))
  throw new Error('Invalid workflow name')
 const errors=[]
 const records=await listWorkflowFiles(cwd,{onError:error=>errors.push(error)})
 const matches=records.filter(record=>record.name===name)
 if(matches.length>1)
  throw new Error(`Workflow name ${name} is ambiguous: ${matches.map(v=>v.file).join(', ')}`)
 if(matches.length===0){
  const suffix=errors.length?` (${errors.length} invalid saved workflow files)`:''
  throw new Error(`Workflow ${name} was not found${suffix}`)
 }
 return matches[0].file
}
