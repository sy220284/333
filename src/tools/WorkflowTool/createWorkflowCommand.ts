import type { Command } from '../../commands.js'
import { listWorkflowFiles } from './workflowCommandIndex.ts'
import { logForDebugging } from '../../utils/debug.js'
export async function getWorkflowCommands(cwd:string):Promise<Command[]>{
 const records=await listWorkflowFiles(cwd,{onError:({file,error})=>logForDebugging(`[Workflow] Invalid saved script ${file}: ${String(error)}`)})
 return records.map(record=>({
  type:'prompt' as const,
  name:record.name,
  description:record.description,
  progressMessage:`Running workflow ${record.name}`,
  contentLength:record.description.length,
  source:'projectSettings' as const,
  async getPromptForCommand(args:string){
   return [{type:'text' as const,
    text:`The user explicitly invoked the saved workflow /${record.name}. Use Workflow({scriptPath:${JSON.stringify(record.file)},args:${JSON.stringify(args)}}) after reviewing the full script and requiring user permission before running agents.`}]
  },
 }))
}
