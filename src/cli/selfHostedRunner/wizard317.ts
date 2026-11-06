/** Operator-facing setup / doctor entrypoints for the 2.1.317 runner.
 * They re-enter the normal CLI with a restricted tool list, keeping
 * 本机凭据配置、信任检查和操作权限由统一会话执行。
 */
import {spawnSync} from 'node:child_process'

export type RunnerWizardMode317='setup'|'doctor'
const COMMON_TOOLS='Bash,Read,Write,TodoWrite,TaskCreate,TaskGet,TaskList,TaskUpdate'
const SETUP_TOOLS=`${COMMON_TOOLS},self_hosted_runner_get_pool,self_hosted_runner_list_runners,self_hosted_runner_list_secrets,self_hosted_runner_read_health,self_hosted_runner_read_metrics,self_hosted_runner_spawn_local,self_hosted_runner_tail_log`
const DOCTOR_TOOLS=`${COMMON_TOOLS},self_hosted_runner_get_pool,self_hosted_runner_list_runners,self_hosted_runner_list_sessions,self_hosted_runner_list_secrets,self_hosted_runner_read_health,self_hosted_runner_read_metrics,self_hosted_runner_tail_log,self_hosted_runner_requeue_session`
const SESSION_OPENING={
  setup:'Start the self-hosted runner setup wizard. Begin with Phase 1 and guide one step at a time.',
  doctor:'Start the self-hosted runner doctor wizard. Ask for the symptom and use the diagnostic categories.',
}
const HELP={
  setup:'Usage: yaoyaoche self-hosted-runner setup [args...]\n\nInteractive wizard: configure a user-owned Runner endpoint, start a local runner, verify registration, and save verified steps.\nAny extra arguments are passed to the underlying 摇摇车 session.',
  doctor:'Usage: yaoyaoche self-hosted-runner doctor [args...]\n\nInteractive wizard: inspect the runner, local health metrics and logs; diagnose auth, network, lifecycle, queue and execution problems; create a redacted evidence bundle.\nAny extra arguments are passed to the underlying 摇摇车 session.',
}
function configuredRunnerEndpoint317(): string {
  return process.env.SELF_HOSTED_RUNNER_API_URL?.trim() || '（未配置）'
}
export function runnerWizardInstructions317(mode:RunnerWizardMode317,endpoint:string):string{
  const context = `当前执行服务：${endpoint}。\n\n`
  return context + (mode==='setup' ? "你是摇摇车自托管 Runner 的安装向导。用户必须主动设置本地或自建执行服务，所有凭据留在本机。\n\n第一步：检查 SELF_HOSTED_RUNNER_API_URL 或 --api-url 是否明确指向用户控制的 Runner 服务。此处配置为：{{ENDPOINT}}。如果未配置，指导用户先部署具备 /v1/code/runners/self-hosted 协议的服务，然后记录它的本机地址或 HTTPS 地址。以用户自己的执行服务为准。\n\n第二步：将此执行服务签发的环境令牌保存在 ./runner-setup/ENVIRONMENT_SECRET，并检查文件权限（Unix 为 0600）；不要在聊天中读取或回显令牌。Runner 管理请求如有需要，独立设置 SELF_HOSTED_RUNNER_ADMIN_TOKEN，与模型 API/OAuth 凭据分离。\n\n第三步：向用户展示启动命令 yaoyaoche self-hosted-runner --api-url <自托管服务地址> --environment-secret-file ./runner-setup/ENVIRONMENT_SECRET --capacity 1 --base-dir ./runner-setup/sessions。需要用户批准才启动。可用 self_hosted_runner_spawn_local（api_url 指向上述服务），再检查本机 /healthz 与 /metrics。\n\n第四步：使用 self_hosted_runner_get_pool、self_hosted_runner_list_runners 查询自托管服务注册状态。每次工具调用后报告真实状态、错误和对应 API；如果服务尚未实现该协议，明确指出接口缺口，不要声称已成功注册或提供不存在的控制台地址。\n\n第五步：在授权的测试仓库内进行一次受限任务，并验证注册、领任务、执行、事件回传、终止和重启恢复。经用户批准生成 ./runner-setup/CHEAT-SHEET.md，记录真实测试通过的命令和故障诊断路径，不记录凭据。" : "你是摇摇车自托管 Runner 的诊断向导。当前用户配置的服务：{{ENDPOINT}}。\n\n检查本地进程和 /healthz、/metrics，诊断环境令牌文件权限、管理 token、TLS、服务路由、注册和心跳、任务领用、工作目录权限、子进程退出与队列阻塞。\n\n若显式配置了 SELF_HOSTED_RUNNER_API_URL 及 SELF_HOSTED_RUNNER_ADMIN_TOKEN，使用 self_hosted_runner_get_pool、list_runners、list_sessions 等工具查询服务端事实；未配置时只做本地诊断，并明确提示缺失的配置项。\n\n收集日志时必须隐藏认证头、token、环境令牌及密码；打包和回传任何诊断资料前取得用户批准。重排任务的 self_hosted_runner_requeue_session 必须单独批准。\n\n给出失败点、日志证据、处理动作和复测结果。诊断可以用同一命令重新开启，使用本地或自托管服务认证。").replaceAll('{{ENDPOINT}}', endpoint)
}
export function runnerWizardCommand317(
  mode:RunnerWizardMode317,args:readonly string[],opts:{
    isCompiled?:boolean; execPath?:string; script?:string; adminUrl?:string
  }={}
):{exec:string;args:string[];prompt:string}{
  const prompt=runnerWizardInstructions317(mode,opts.adminUrl??configuredRunnerEndpoint317())
  const exec=opts.execPath??process.execPath
  const prefix=(opts.isCompiled ?? (typeof Bun !== 'undefined' && typeof Bun.embeddedFiles !== 'undefined'))
    ? [] : [opts.script??process.argv[1]].filter((v):v is string=>Boolean(v))
  const userPrompt=args.length>0&&!args[0]?.startsWith('-')?[]:[SESSION_OPENING[mode]]
  return {exec,prompt,args:[...prefix,...userPrompt,'--append-system-prompt',prompt,
    '--tools',mode==='setup'?SETUP_TOOLS:DOCTOR_TOOLS,'--permission-mode','default',...args]}
}
export function runRunnerWizard317(mode:RunnerWizardMode317,args:readonly string[]):number{
  if(args.includes('--help')||args.includes('-h')){process.stdout.write(`${HELP[mode]}\n`);return 0}
  const cmd=runnerWizardCommand317(mode,args)
  const child=spawnSync(cmd.exec,cmd.args,{stdio:'inherit',
    env:{...process.env,CLAUDE_CODE_SELF_HOSTED_RUNNER_WIZARD:mode}})
  if(child.error)throw Error(`self-hosted-runner ${mode}: failed to spawn child: ${child.error.message}`)
  const code=child.status??1
  if(code!==0)process.stderr.write(`self-hosted-runner ${mode}: child exit ${code}\n`)
  process.stderr.write(`[self-hosted-runner:${mode}] Continue by running this wizard again; regular --resume does not restore the dedicated guidance.\n`)
  return code
}
