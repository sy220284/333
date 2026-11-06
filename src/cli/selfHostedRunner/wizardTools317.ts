/**
 * Dedicated 2.1.317 setup/doctor tools. Registered only inside the wizard
 * child process, leaving ordinary CLI/agent sessions unchanged.
 */
import {z} from 'zod/v4'
import {buildTool,type ToolDef,type Tool} from '../../Tool.js'
import {spawn} from 'node:child_process'
import {open,stat,writeFile,mkdir} from 'node:fs/promises'
import {dirname,resolve} from 'node:path'
import {
  getRunnerPool317,listRunnerSessions317,listRunnerMachines317,listRunnerSecrets317,
  requeueRunnerSession317,probeRunnerLocal317,tailRunnerLog317
} from './runnerAdmin317.ts'
import { resolveRunnerEndpoint } from './endpointPolicy.ts'

const taggedId=z.string().regex(/^[a-zA-Z0-9_-]{1,256}$/)
const output=z.record(z.string(),z.unknown())
const wizardActive=()=>['setup','doctor'].includes(process.env.CLAUDE_CODE_SELF_HOSTED_RUNNER_WIZARD??'')
type OperatorOutput317=Record<string,unknown>
function wizardTool317<S extends z.ZodType<Record<string,unknown>>>(
  name:string,descriptionText:string,schema:S,
  perform:(args:z.infer<S>,signal:AbortSignal)=>Promise<OperatorOutput317>,
  writeAction=false
):Tool{
  const tool=buildTool({
    name,searchHint:descriptionText,maxResultSizeChars:200_000,shouldDefer:true,
    get inputSchema():S{return schema},
    get outputSchema(){return output},
    isEnabled:wizardActive,
    isReadOnly(){return !writeAction},
    isConcurrencySafe(){return !writeAction},
    enablesCodeExecution:writeAction,
    async description(){return descriptionText},
    async prompt(){return descriptionText},
    renderToolUseMessage(){return null},
    async checkPermissions(input){
      if(!writeAction)return {behavior:'allow' as const,updatedInput:input}
      return {behavior:'ask' as const,
        message:`Allow Runner operation ${name}? Review the target and environment before proceeding.`}
    },
    toAutoClassifierInput(input){return `${name}: ${JSON.stringify(input)}`},
    async call(input,context){
      return {data:await perform(input,context.abortController.signal)}
    },
    mapToolResultToToolResultBlockParam(content,toolUseID){
      return {tool_use_id:toolUseID,type:'tool_result' as const,
        content:JSON.stringify(content)}
    }
  } satisfies ToolDef<S,z.infer<typeof output>>)
  return tool
}
const poolSchema=z.strictObject({pool_id:taggedId})
const sessionsSchema=z.strictObject({
  pool_id:taggedId,status_filter:z.string().optional()
})
const portSchema=z.strictObject({
  health_port:z.number().int().min(0).max(65535).optional()
})
const tailSchema=z.strictObject({
  log_path:z.string().min(1),
  bytes:z.number().int().positive().max(1_000_000).optional()
})
const spawnSchema=z.strictObject({
  api_url:z.string().min(1).optional(),
  secret_file_path:z.string().min(1),
  capacity:z.number().int().min(1).max(128).optional(),
  base_dir:z.string().min(1).optional(),
  health_port:z.number().int().min(0).max(65535).optional(),
  log_path:z.string().min(1).optional()
})
const requeueSchema=z.strictObject({
  session_id:taggedId,runner_id:taggedId
})
async function spawnLocalRunner317(args:z.infer<typeof spawnSchema>){
  const apiUrl=resolveRunnerEndpoint(args.api_url ?? process.env.SELF_HOSTED_RUNNER_API_URL)
  const secretPath=resolve(args.secret_file_path)
  const source=await stat(secretPath)
  if(!source.isFile())throw Error('Runner environment key must be a regular file')
  if(process.platform!=='win32'&&(source.mode&0o077)!==0)
    throw Error('Runner environment secret must be accessible only by its owner (chmod 600)')
  const baseDir=resolve(args.base_dir??'./runner-setup/workspace')
  const logPath=resolve(args.log_path??'./runner-setup/runner.log')
  const pidPath=resolve('./runner-setup/runner.pid')
  await Promise.all([mkdir(dirname(logPath),{recursive:true,mode:0o700}),
    mkdir(dirname(pidPath),{recursive:true,mode:0o700}),
    mkdir(baseDir,{recursive:true,mode:0o700})])
  const log=await open(logPath,'a',0o600)
  const prefix=(typeof Bun!=='undefined'&&typeof Bun.embeddedFiles!=='undefined')
    ?[]:process.argv[1]?[process.argv[1]]:[]
  const childArgs=[
    ...prefix,'self-hosted-runner','--api-url',apiUrl,
    '--environment-secret-file',secretPath,
    '--capacity',String(args.capacity??1),
    '--base-dir',baseDir,'--health-port',String(args.health_port??8080),
  ]
  let child
  try{
    child=spawn(process.execPath,childArgs,{
      detached:true,stdio:['ignore',log.fd,log.fd],
      env:{...process.env,CLAUDE_CODE_SELF_HOSTED_RUNNER_WIZARD:''},
      windowsHide:true,
    })
    await new Promise<void>((resolvePromise,reject)=>{
      child.once('spawn',()=>resolvePromise())
      child.once('error',reject)
    })
  }finally{await log.close()}
  const pid=child.pid
  if(!pid)throw Error('Failed to start self-hosted runner: missing pid')
  child.unref()
  await writeFile(pidPath,String(pid),{mode:0o600})
  const quoted=(value:string)=>/^[\\w@%+=:,./-]+$/.test(value)
    ?value:`'${value.replace(/'/g,"'\\\\''")}'`
  const command=[process.execPath,...childArgs].map(quoted).join(' ')+
    ' >> '+quoted(logPath)+' 2>&1 &'
  return {pid,pid_file:pidPath,log_path:logPath,health_port:args.health_port??8080,
    command,equivalent:{api:`${apiUrl}/v1/code/runners/self-hosted/runners`}}
}
export const SELF_HOSTED_RUNNER_TOOLS:readonly Tool[]=[
  wizardTool317('self_hosted_runner_get_pool',
    'Read self-hosted environment state and aggregate queue/capacity counters; report equivalent Admin UI path',
    poolSchema,async (x,signal)=>getRunnerPool317(x.pool_id,{},signal)),
  wizardTool317('self_hosted_runner_list_runners',
    'List registered Runner machines and leases for an environment',
    poolSchema,async (x,signal)=>listRunnerMachines317(x.pool_id,{},signal)),
  wizardTool317('self_hosted_runner_list_sessions',
    'Inspect queued, assigned, backoff, circuit-broken self-hosted sessions',
    sessionsSchema,async (x,signal)=>listRunnerSessions317(x.pool_id,x.status_filter,{},signal)),
  wizardTool317('self_hosted_runner_list_secrets',
    'Read metadata only for self-hosted environment keys; never show secret values',
    poolSchema,async (x,signal)=>listRunnerSecrets317(x.pool_id,{},signal)),
  wizardTool317('self_hosted_runner_read_health',
    'Probe the local Runner /healthz endpoint at 127.0.0.1',
    portSchema,async x=>probeRunnerLocal317('healthz',x.health_port??8080)),
  wizardTool317('self_hosted_runner_read_metrics',
    'Read Prometheus Runner gauges from local /metrics',
    portSchema,async x=>probeRunnerLocal317('metrics',x.health_port??8080)),
  wizardTool317('self_hosted_runner_spawn_local',
    'Spawn an operator-approved local self-hosted runner using a private environment secret file',
    spawnSchema,async x=>spawnLocalRunner317(x),true),
  wizardTool317('self_hosted_runner_tail_log',
    'Read the final bytes of a Runner log file with secret redaction',
    tailSchema,async x=>tailRunnerLog317(x.log_path,x.bytes??65536)),
  wizardTool317('self_hosted_runner_requeue_session',
    'Requeue one operator-approved failing session on another Runner',
    requeueSchema,async (x,signal)=>requeueRunnerSession317(x.session_id,x.runner_id,{},signal),true),
]
