import { join } from 'node:path'
const RUN_ID=/^wf_[0-9a-f]{8}-[0-9a-f]{3}$/
export function workflowRunDirectory(projectDir,sessionId,runId){
 if(typeof projectDir!=='string'||!projectDir||typeof sessionId!=='string'||!sessionId||!RUN_ID.test(runId))
   throw new Error('Invalid workflow run storage identity')
 return join(projectDir,sessionId,'subagents','workflows',runId)
}
export function workflowSessionScripts(projectDir,sessionId){
 if(typeof projectDir!=='string'||!projectDir||typeof sessionId!=='string'||!sessionId)
   throw new Error('Invalid workflow session storage')
 return join(projectDir,sessionId,'workflows','scripts')
}
export function workflowPaths(projectDir,sessionId,runId,name){
 if(typeof name!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(name))throw new Error('Invalid workflow name')
 const transcriptDir=workflowRunDirectory(projectDir,sessionId,runId)
 const scriptPath=join(workflowSessionScripts(projectDir,sessionId),`${name}-${runId}.js`)
 return {transcriptDir,scriptPath,journal:join(transcriptDir,'journal.jsonl'),
   summaryPath:workflowSummaryPath(projectDir,sessionId,runId)}
}

/** Official 2.1.310 persists the completed result outside subagent journals. */
export function workflowSummaryPath(projectDir,sessionId,runId){
 if(typeof projectDir!=='string'||!projectDir||typeof sessionId!=='string'||!sessionId||!RUN_ID.test(runId))
   throw new Error('Invalid workflow run storage identity')
 return join(projectDir,sessionId,'workflows',runId+'.json')
}
