/** Operator-facing setup / doctor entrypoints for the 2.1.317 runner.
 * They re-enter the normal CLI with a restricted tool list, keeping
 * account login, trust decisions, and permission checks in one place.
 */
import {spawnSync} from 'node:child_process'
import {getOauthConfig} from '../../constants/oauth.js'

export type RunnerWizardMode317='setup'|'doctor'
const COMMON_TOOLS='Bash,Read,Write,TodoWrite,TaskCreate,TaskGet,TaskList,TaskUpdate'
const SETUP_TOOLS=COMMON_TOOLS+',self_hosted_runner_get_pool,self_hosted_runner_list_runners,self_hosted_runner_list_secrets,self_hosted_runner_read_health,self_hosted_runner_read_metrics,self_hosted_runner_spawn_local,self_hosted_runner_tail_log'
const DOCTOR_TOOLS=COMMON_TOOLS+',self_hosted_runner_get_pool,self_hosted_runner_list_runners,self_hosted_runner_list_sessions,self_hosted_runner_list_secrets,self_hosted_runner_read_health,self_hosted_runner_read_metrics,self_hosted_runner_tail_log,self_hosted_runner_requeue_session'
const SESSION_OPENING={
  setup:'Start the self-hosted runner setup wizard. Begin with Phase 1 and guide one step at a time.',
  doctor:'Start the self-hosted runner doctor wizard. Ask for the symptom and use the diagnostic categories.',
}
const HELP={
  setup:'Usage: avenlo self-hosted-runner setup [args...]\n\nInteractive wizard: create a cloud environment in the Admin UI, spawn a local runner, verify its registration, and write a cheat sheet.\nAny extra arguments are passed to the underlying Avenlo session.',
  doctor:'Usage: avenlo self-hosted-runner doctor [args...]\n\nInteractive wizard: inspect the runner, local health metrics and logs; diagnose auth, network, lifecycle, queue and execution problems; create a redacted evidence bundle.\nAny extra arguments are passed to the underlying Avenlo session.',
}
function safeAdminUrl317(){
  // Identity is read through the same OAuth configuration as regular CLI.
  const url=getOauthConfig().CLAUDE_AI_ORIGIN
  return (typeof url==='string'&&url.startsWith('https://')?url:'https://claude.ai').replace(/\/+$/,'')
}
export function runnerWizardInstructions317(mode:RunnerWizardMode317,adminUrl:string):string{
  if(mode==='setup')return `You are guiding an operator to a working self-hosted runner on Avenlo 2.1.317. The operator must learn the repeatable UI path and the exact CLI command.\n
Phase 1 (required): Have the operator open ${adminUrl}/admin-settings/cloud-environments (Admin settings > Cloud environments), enable self-hosted environments, create an environment, copy its one-time environment key to ./runner-setup/ENVIRONMENT_SECRET and copy the Environment ID ccpool_... Do not ask them to paste the secret into chat and never echo its contents. Verify that file exists and its mode is 0600 using local shell. Point them to the environment's Configuration tab and Activity > Runners.\n
Start the runner using avenlo self-hosted-runner --environment-secret-file ./runner-setup/ENVIRONMENT_SECRET --capacity 1 --base-dir ./runner-setup/sessions (flags separated by spaces). Keep the environment secret private. The operator approves starting the process. Verify a successful [runner] registered message and use UI Activity > Runners to independently verify alive_runner_count. If the local runner offers /healthz, also inspect it. Describe concrete reasons when registration fails.\n
Once the environment shows a live runner, guide the operator to ${adminUrl}/code, select the new environment, and start a test session against a repository cloned over HTTPS without prompting. Explain the common git credential error and how to clear a failed queued session before retrying.\n
If the user requested quick, stop after Phase 1. Otherwise explain the Admin UI: Configuration (Environment ID, rotate/revoke keys); Activity > Runners (lease, capacity, force kill); Activity > Sessions (retry); diagnostics and Prometheus /metrics. Write ./runner-setup/CHEAT-SHEET.md with the verified command and UI map; then stop the local test runner only after explicit approval, verify its absence from Active runners, and report observations. No production deployment without operator approval.\n
Use self_hosted_runner_get_pool({pool_id}) to verify the environment (it must initially have zero runners), then self_hosted_runner_spawn_local({secret_file_path:'./runner-setup/ENVIRONMENT_SECRET',capacity:1}) with operator approval, and self_hosted_runner_read_health once. Poll self_hosted_runner_get_pool and self_hosted_runner_list_runners to confirm the alive count changes and show the lease. Present every API result's equivalent.ui path, and verify the runner actually appeared. Use self_hosted_runner_read_metrics and self_hosted_runner_tail_log for diagnosis. Follow normal permission checks. Never claim an API check was performed when it was not.`
  return `You are the Avenlo 2.1.317 self-hosted runner doctor. Diagnose with the operator, then collect evidence. Don't print or request raw credentials.\n
Diagnostic categories: (1) environment key and OAuth; (2) network, DNS, proxy, TLS; (3) runner registration/leases; (4) checkout and git credentials; (5) job start/termination; (6) queue/backoff and circuit breaker; (7) version incompatibility/clock skew; (8) /healthz and Prometheus /metrics; (9) orchestrator autoscaling.\n
Ask for the symptom, gather avenlo --version, environment ID (not environment key), OS, sanitized flags, local /healthz and /metrics if available, last 64KB of runner logs, and server-side Activity > Sessions / Runners at ${adminUrl}/admin-settings/cloud-environments. For orchestrator /healthz always read the JSON body: HTTP 200 is liveness, connected and last_error indicate readiness. For unresolved errors check hook stderr, permissions, expected spawn seconds, timeout, retryable vs circuit-broken.\n
When asked for escalation, create timestamped runner-diag-<ts> directory with healthz.json, metrics.txt, runner.log, environment.json, runners.json, sessions.json, versions.txt, config-redacted.txt, DIAGNOSIS.md; redact bearer tokens, secrets, API keys and credential paths; review the files with the operator before packaging to runner-diag-<ts>.tar.gz. Never upload private logs automatically.\n
Use self_hosted_runner_get_pool/list_sessions/list_runners/list_secrets for remote state, self_hosted_runner_read_health/read_metrics for local probes, and self_hosted_runner_tail_log for redacted logs. The self_hosted_runner_requeue_session tool requires explicit operator permission. Surface each equivalent.ui path after the tool call. Operator owns any Admin UI action and secret rotation. If the target process is unreachable, report the exact failed probe instead of assuming healthy. After diagnostics, tell operator to re-run avenlo self-hosted-runner doctor to retain specialist context.`
}
export function runnerWizardCommand317(
  mode:RunnerWizardMode317,args:readonly string[],opts:{
    isCompiled?:boolean; execPath?:string; script?:string; adminUrl?:string
  }={}
):{exec:string;args:string[];prompt:string}{
  const prompt=runnerWizardInstructions317(mode,opts.adminUrl??safeAdminUrl317())
  const exec=opts.execPath??process.execPath
  const prefix=(opts.isCompiled ?? (typeof Bun !== 'undefined' && typeof Bun.embeddedFiles !== 'undefined'))
    ? [] : [opts.script??process.argv[1]].filter((v):v is string=>Boolean(v))
  const userPrompt=args.length>0&&!args[0]?.startsWith('-')?[]:[SESSION_OPENING[mode]]
  return {exec,prompt,args:[...prefix,...userPrompt,'--append-system-prompt',prompt,
    '--tools',mode==='setup'?SETUP_TOOLS:DOCTOR_TOOLS,'--permission-mode','default',...args]}
}
export function runRunnerWizard317(mode:RunnerWizardMode317,args:readonly string[]):number{
  if(args.includes('--help')||args.includes('-h')){process.stdout.write(HELP[mode]+'\n');return 0}
  const cmd=runnerWizardCommand317(mode,args)
  const child=spawnSync(cmd.exec,cmd.args,{stdio:'inherit',
    env:{...process.env,CLAUDE_CODE_SELF_HOSTED_RUNNER_WIZARD:mode}})
  if(child.error)throw Error('self-hosted-runner '+mode+': failed to spawn child: '+child.error.message)
  const code=child.status??1
  if(code!==0)process.stderr.write('self-hosted-runner '+mode+': child exit '+code+'\n')
  process.stderr.write('[self-hosted-runner:'+mode+'] Continue by running this wizard again; regular --resume does not restore the dedicated guidance.\n')
  return code
}
