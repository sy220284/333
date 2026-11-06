import { readdir, realpath } from 'node:fs/promises'
import { join, sep } from 'node:path'
import { readWorkflowSummary, type WorkflowSummary317 } from './workflowSummaryStore.ts'
export type { WorkflowSummary317 } from './workflowSummaryStore.ts'
import { workflowSummaryPath, workflowRunDirectory, workflowSessionScripts } from './workflowStoragePaths.ts'
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

/** Project-wide read-only history, including records from earlier CLI sessions.
 * Each session still validates the original owner identity before disclosure.
 */
export async function readProjectWorkflowHistory(projectDir: string): Promise<WorkflowHistoryResult317> {
 let entries
 try { entries = await readdir(projectDir, { withFileTypes: true }) }
 catch (error) {
   if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
     return { runs: [], errors: [] }
   throw error
 }
 const sessions = entries.filter(entry => entry.isDirectory()).map(entry => entry.name)
 const runs: WorkflowSummary317[] = [], errors: WorkflowHistoryError317[] = []
 for (const sessionId of sessions) {
   const history = await readWorkflowHistory(projectDir, sessionId)
   runs.push(...history.runs)
   errors.push(...history.errors.map(error => ({
     ...error,
     file: `${sessionId}/${error.file}`,
   })))
 }
 runs.sort((a, b) => (Number(b.startTime) || 0) - (Number(a.startTime) || 0))
 return { runs, errors }
}

/** Resume a finished run from an earlier session without editing its evidence.
 * The source must be in the same project and its script must remain within
 * that session's owned workflow directory.
 */
export async function findWorkflowResumeSource(projectDir: string, sessionId: string, runId: string): Promise<{
  sessionId: string; scriptPath: string; journalPath: string
}> {
 const history = await readProjectWorkflowHistory(projectDir)
 const found = history.runs.find(run => run.runId === runId && run.sessionId !== sessionId)
 if (!found?.sessionId)
   throw new Error(`当前项目找不到其他会话的工作流 ${runId}`)
 if (!['completed', 'failed', 'killed'].includes(found.status ?? ''))
   throw new Error(`工作流 ${runId} 仍处于 ${found.status ?? 'unknown'}，请先停止原执行再恢复`)
 const scripts = workflowSessionScripts(projectDir, found.sessionId)
 if (!found.scriptPath.startsWith(scripts + sep) ||
     !found.scriptPath.endsWith(`-${runId}.js`))
   throw new Error('历史工作流脚本不属于其原会话')
 const [scriptRoot, scriptPath] = await Promise.all([realpath(scripts), realpath(found.scriptPath)])
 if (!scriptPath.startsWith(scriptRoot + sep))
   throw new Error('历史工作流脚本指向原会话目录外')
 return {
   sessionId: found.sessionId,
   scriptPath,
   journalPath: join(workflowRunDirectory(projectDir, found.sessionId, runId), 'journal.jsonl'),
 }
}
