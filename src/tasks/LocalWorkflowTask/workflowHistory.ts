import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { readWorkflowSummary } from './workflowSummaryStore.ts'
import { workflowSummaryPath } from './workflowStoragePaths.ts'
export type WorkflowSummary317 = {
  runId: string
  scriptPath: string
  sessionId?: string
  startTime?: number
  workflowName?: string
  summary?: string
  status?: string
  result?: unknown
  workflowProgress?: Array<{title: string}>
  agentCount?: number
  durationMs?: number
  error?: string
}
export type WorkflowHistoryError317 = { file: string; message: string }
export type WorkflowHistoryResult317 = { runs: WorkflowSummary317[]; errors: WorkflowHistoryError317[] }
const RUN_FILE=/^wf_[0-9a-f]{8}-[0-9a-f]{3}\.json$/
/** List durable completed and active runs from this exact project/session. */
export async function readWorkflowHistory(projectDir: string, sessionId: string): Promise<WorkflowHistoryResult317> {
 const folder=join(projectDir,sessionId,'workflows')
 let entries
 try{entries=await readdir(folder,{withFileTypes:true})}
 catch(error){
  if(error instanceof Error && 'code' in error && error.code==='ENOENT')return {runs:[],errors:[]}
  throw error
 }
 const runs: WorkflowSummary317[] = [], errors: WorkflowHistoryError317[] = []
 for(const entry of entries){
  if(!entry.isFile()||!RUN_FILE.test(entry.name))continue
  const runId=entry.name.slice(0,-5)
  try{
   const record=await readWorkflowSummary(workflowSummaryPath(projectDir,sessionId,runId))
   if(record.runId!==runId||(record.sessionId!==undefined&&record.sessionId!==sessionId))
    throw new Error('Workflow summary session identity mismatch')
   runs.push(record)
  }catch(error){
   errors.push({file:entry.name,message:error instanceof Error?error.message:String(error)})
  }
 }
 runs.sort((a,b)=>(Number(b.startTime)||0)-(Number(a.startTime)||0))
 return {runs,errors}
}
