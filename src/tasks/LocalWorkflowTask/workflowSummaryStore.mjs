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

/** Serialize every run snapshot, and make the first terminal transition final.
 * Late phase callbacks, cancellation races and duplicate completions cannot
 * rewrite a finished run or resurrect its task state.
 */
export function createWorkflowSummaryRecorder(path,initial,{write=writeWorkflowSummary}={}){
 let current={...initial}
 let closed=false
 let pending=Promise.resolve()
 const apply=(patch,terminal)=>{
  if(closed)return pending
  if(terminal)closed=true
  current={...current,...patch}
  const snapshot={...current}
  pending=pending.then(()=>write(path,snapshot))
  return pending
 }
 return {
  get snapshot(){return {...current}},
  get finished(){return closed},
  update:patch=>apply(patch,false),
  finish:patch=>apply(patch,true),
  flush:()=>pending,
 }
}

/** Keep the session's persistent script aligned with an approved resumed run.
 * Atomic replacement prevents later resumes from accidentally re-running
 * the earlier script when the caller supplied edited inline code.
 */
export async function syncWorkflowScript(path,script){
 if(typeof path!=='string'||!path.endsWith('.js')||typeof script!=='string')
  throw new Error('Invalid saved Workflow script')
 const before=await readFile(path,'utf8')
 if(before===script)return false
 const temporary=path+'.tmp-'+randomUUID()
 try{
  await writeFile(temporary,script,{flag:'wx',mode:0o600})
  await rename(temporary,path)
 }catch(error){
  await rm(temporary,{force:true})
  throw error
 }
 return true
}
