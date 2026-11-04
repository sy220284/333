/**
 * Isolated self-hosted runner lifecycle (Claude Code 2.1.317).
 * Official comparison: chunk-j5svdpw5.js:4495-4543,4690-4800,5051-5088;
 * chunk-mn2j77dt.js:lUn() for the wire protocol.
 *
 * This host uses the existing CCR v2 child transport. Each assignment owns
 * its credentials, checkout directory, worker epoch and terminal handle.
 */
import { mkdir, readFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { hostname } from 'node:os'
import { createSessionSpawner } from '../../bridge/sessionRunner.js'
import type { SessionHandle } from '../../bridge/types.js'
import { RunnerHttpError317, SelfHostedRunnerApi317 } from './runnerApi317.ts'

export type RunnerHostOptions317 = {
  api: SelfHostedRunnerApi317
  baseDir: string
  capacity: number
  execPath: string
  scriptArgs: string[]
  env: NodeJS.ProcessEnv
  pollIntervalMs?: number
  drainWaitMs?: number
  signal?: AbortSignal
  onStatus?: (message: string) => void
  createChild?: (sessionId: string, sdkUrl: string, accessToken: string,
    epoch: number, cwd: string, environment: NodeJS.ProcessEnv) => SessionHandle
}
type ActiveAssignment = {
  handle: SessionHandle
  completion: Promise<void>
}
function wait(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted || ms <= 0) return Promise.resolve()
  return new Promise(resolve => {
    const timeout = setTimeout(done, ms)
    function done() { clearTimeout(timeout); signal.removeEventListener('abort', done); resolve() }
    signal.addEventListener('abort', done, {once:true})
  })
}
function safeSessionId(id: string): string {
  if (!/^[a-zA-Z0-9_-]{1,256}$/.test(id)) throw new Error('Unsafe runner assignment ID')
  return id
}
function sessionDirectory(baseDir: string, id: string): string {
  const root = resolve(baseDir)
  const target = resolve(root, safeSessionId(id))
  if (!target.startsWith(root + sep)) throw new Error('Session directory escapes runner root')
  return target
}
function runnerTokenNeedsRefresh(token: string, now: number): boolean {
  const payload = token.split('.')[1]
  if (!payload) return false
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {exp?:unknown}
    return typeof parsed.exp === 'number' && parsed.exp * 1000 < now + 90_000
  } catch { return false }
}
function boundedPollDelay(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.max(250, Math.min(60_000, n * 1000))
}
function secureChildEnvironment(base: NodeJS.ProcessEnv, supplied: Record<string, unknown>): NodeJS.ProcessEnv {
  // The environment secret and runner token must never be passed into a child.
  const env = {...base}
  for (const key of ['SELF_HOSTED_RUNNER_ENVIRONMENT_SECRET', 'SELF_HOSTED_RUNNER_POOL_SECRET',
    'SELF_HOSTED_RUNNER_WORK_ORDER_JWT', 'CLAUDE_CODE_OAUTH_TOKEN']) delete env[key]
  for (const [key,value] of Object.entries(supplied)) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key) || typeof value !== 'string' || value.includes('\0')) {
      throw new Error('Runner remote configuration contains an invalid environment entry')
    }
    // Dynamic library injection and Node CLI option hooks must not come from
    // a session. Normal application environment still comes from the server.
    if (['NODE_OPTIONS','BUN_OPTIONS','NODE_EXTRA_CA_CERTS','LD_PRELOAD',
      'DYLD_INSERT_LIBRARIES','SELF_HOSTED_RUNNER_ENVIRONMENT_SECRET'].includes(key)) {
      throw new Error('Runner remote configuration attempted process-level injection: ' + key)
    }
    env[key] = value
  }
  return env
}

export async function startSelfHostedRunnerHost317(options: RunnerHostOptions317): Promise<void> {
  if (!Number.isSafeInteger(options.capacity) || options.capacity < 1 || options.capacity > 128) {
    throw new RangeError('Runner capacity must be an integer from 1 to 128')
  }
  const status = options.onStatus ?? (() => {})
  const root = resolve(options.baseDir)
  await mkdir(root, {recursive:true,mode:0o700})
  const ownedAbort = new AbortController()
  const externalAbort = options.signal
  const onExternalAbort = () => ownedAbort.abort(externalAbort?.reason)
  if (externalAbort?.aborted) onExternalAbort()
  else externalAbort?.addEventListener('abort', onExternalAbort, {once:true})
  const active = new Map<string, ActiveAssignment>()
  const retained = new Set<string>()
  const transientErrors = new Set<number>([429,500,502,503,504])
  let runnerToken = ''
  let runnerId = ''
  let pollErrors = 0
  let notFoundErrors = 0
  let shutdownRequested = ownedAbort.signal.aborted

  const launch = async (id: string): Promise<void> => {
    safeSessionId(id)
    let remoteToken = ''
    let workerEpoch: number | undefined
    let remoteBase = ''
    try {
      const issued = await options.api.issueSessionToken(runnerToken,id,ownedAbort.signal)
      remoteToken = issued.session_token
      if (issued.tools_host) throw new Error('Assignment requires a dedicated tools host')
      const remote = await options.api.getSessionRemoteConfig(id,remoteToken,ownedAbort.signal)
      if (remote.sources.length || remote.push_targets.length) {
        throw new Error('Assignment requires checkout/push lifecycle hooks that are not configured')
      }
      remoteBase = remote.api_base_url ?? ''
      if (!remoteBase) throw new Error('Assignment lacks api_base_url')
      const cwd = sessionDirectory(root,id)
      await mkdir(cwd,{recursive:true,mode:0o700})
      const env = secureChildEnvironment(options.env,remote.environment_variables)
      workerEpoch = await options.api.registerWorker(remoteBase,id,remoteToken,ownedAbort.signal)
      const sdkUrl = new URL('/v1/code/sessions/'+encodeURIComponent(id),remoteBase).toString()
      const handle = options.createChild
        ? options.createChild(id,sdkUrl,remoteToken,workerEpoch,cwd,env)
        : createSessionSpawner({
            execPath:options.execPath,scriptArgs:options.scriptArgs,
            env,verbose:false,sandbox:true,onDebug:status,
          }).spawn({
            sessionId:id,sdkUrl,accessToken:remoteToken,useCcrV2:true,
            workerEpoch,
          },cwd)
      status('[runner:session] started '+id)
      const completion = (async () => {
        const result = await handle.done
        if (result === 'failed') {
          await options.api.reportSessionFailure(runnerToken,id,'session_failed')
        } else {
          const outcome = await options.api.releaseSession(runnerToken,id)
          if (!outcome.released) {
            status('[runner:session] server declined release for '+id)
          }
        }
        status('[runner:session] '+id+' '+result)
      })().catch(error => {
        status('[runner:session] '+id+' completion error: '+
          (error instanceof Error ? error.message : String(error)))
        throw error
      }).finally(() => { active.delete(id) })
      active.set(id,{handle,completion})
      // Observe the rejected completion without detaching an unhandled promise.
      void completion.catch(() => {})
    } catch (error) {
      if (ownedAbort.signal.aborted) return
      status('[runner:session] failed to start '+id+': '+
        (error instanceof Error ? error.message : String(error)))
      await options.api.reportSessionFailure(runnerToken,id,'setup_failed',
        remoteToken ? 'worker_start_failed' : 'token_failed')
    }
  }

  // Bound every drain phase. An unresponsive child must never keep the
  // runner registered forever, and a finished child must not leave a live timer.
  const settleOrTimeout = async (sessions: readonly ActiveAssignment[], ms: number): Promise<boolean> => {
    const settled = Promise.allSettled(sessions.map(item => item.completion))
    if (sessions.length === 0) return true
    if (ms <= 0) return false
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        settled.then(() => true),
        new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), ms) }),
      ])
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
  const stopSessions = async (): Promise<void> => {
    const pending = [...active.values()]
    if (pending.length === 0) return
    if (await settleOrTimeout(pending, Math.max(0,options.drainWaitMs ?? 0))) return
    for (const item of active.values()) item.handle.kill()
    if (await settleOrTimeout(pending, 15_000)) return
    for (const item of active.values()) item.handle.forceKill()
    // Release the host lease after force-kill without hanging on a broken
    // ChildProcess close callback. Report any still-active sessions.
    if (!await settleOrTimeout(pending, 5_000)) {
      status('[runner] force-killed child did not exit before deadline')
    }
  }

  try {
    const registered = await options.api.registerRunner({clientLabel:hostname()})
    runnerId=registered.runner_id
    runnerToken=registered.runner_token
    status('[runner] registered '+runnerId)
    while (!ownedAbort.signal.aborted) {
      if (runnerTokenNeedsRefresh(runnerToken,Date.now())) {
        const next = await options.api.refreshToken(runnerToken)
        runnerToken=next.token
      }
      try {
        const poll = await options.api.pollWork(runnerToken,runnerId,
          options.capacity-active.size,ownedAbort.signal)
        pollErrors=0
        notFoundErrors=0
        const assigned = new Set(poll.assignment_ids)
        for (const id of [...retained]) if (!assigned.has(id) && !active.has(id)) retained.delete(id)
        for (const id of poll.assignment_ids) {
          if (active.size>=options.capacity || active.has(id) || retained.has(id)) continue
          retained.add(id)
          // Fire off preparation but keep capacity reservations while it starts.
          const start = launch(id)
          // Preparation is joined here so an unbounded number of assignments
          // cannot bypass capacity while worker registration is in flight.
          await start
        }
        await wait(boundedPollDelay(poll.suggested_poll_interval,
          options.pollIntervalMs ?? 2_000),ownedAbort.signal)
      } catch (error) {
        if (ownedAbort.signal.aborted) break
        if (error instanceof RunnerHttpError317) {
          if (error.isAuthFailure) throw error
          if (error.httpStatus===404 && ++notFoundErrors>=3) throw error
          if (error.httpStatus!==404) notFoundErrors=0
          if (!transientErrors.has(error.httpStatus) && error.httpStatus!==404) throw error
        } else {
          notFoundErrors=0
        }
        pollErrors++
        const backoff = Math.min(30_000,1_000*Math.pow(2,Math.min(5,pollErrors-1)))
        status('[runner] poll retry '+pollErrors+' in '+backoff+'ms')
        await wait(backoff,ownedAbort.signal)
      }
    }
    shutdownRequested=true
  } finally {
    externalAbort?.removeEventListener('abort',onExternalAbort)
    ownedAbort.abort()
    // Release the host lease only after child processes are stopped.
    await stopSessions()
    if (runnerToken) {
      try { await options.api.deregisterRunner(runnerToken,{reason:shutdownRequested
        ? 'shutdown_signal':'runner_error'}) }
      catch (error) {
        status('[runner] deregistration failed: '+
          (error instanceof Error ? error.message : String(error)))
        if (shutdownRequested) throw error
      }
    }
  }
}

type CliOptions = { apiUrl: string; secretFile?: string; capacity: number; baseDir: string;
  execPath: string; pollMs: number; drainMs: number }
function parseArgs(argv: readonly string[], env: NodeJS.ProcessEnv): CliOptions | 'help' {
  if (argv.includes('--help') || argv.includes('-h')) return 'help'
  const parsed: CliOptions = {
    apiUrl: env.SELF_HOSTED_RUNNER_API_URL ?? 'https://api.anthropic.com',
    capacity:Number(env.SELF_HOSTED_RUNNER_CAPACITY ?? 1),
    baseDir:env.SELF_HOSTED_RUNNER_BASE_DIR ?? join(process.cwd(),'.claude-runner'),
    execPath:process.execPath,pollMs:2000,drainMs:0,
  }
  for(let i=0;i<argv.length;i++){
    const flag=argv[i]
    if(!['--api-url','--environment-secret-file','--capacity','--base-dir','--exec-path',
      '--poll-interval-ms','--drain-wait-sec'].includes(flag)){
      throw new Error('Unknown self-hosted-runner argument: '+flag)
    }
    const value=argv[++i]
    if(!value || value.startsWith('--')) throw new Error(flag+' requires a value')
    switch(flag){
      case '--api-url': parsed.apiUrl=value;break
      case '--environment-secret-file': parsed.secretFile=value;break
      case '--capacity': parsed.capacity=Number(value);break
      case '--base-dir': parsed.baseDir=value;break
      case '--exec-path': parsed.execPath=value;break
      case '--poll-interval-ms': parsed.pollMs=Number(value);break
      case '--drain-wait-sec': parsed.drainMs=Number(value)*1000;break
    }
  }
  if(!Number.isSafeInteger(parsed.pollMs)||parsed.pollMs<250) throw new Error('Invalid runner polling interval')
  if(!Number.isSafeInteger(parsed.drainMs)||parsed.drainMs<0) throw new Error('Invalid runner drain wait')
  return parsed
}

export async function selfHostedRunnerMain317(argv: readonly string[]): Promise<void> {
  const config=parseArgs(argv,process.env)
  if(config==='help'){
    process.stdout.write('Usage: claude self-hosted-runner [options]\n'+
      '  --api-url <url>                 Runner API URL\n'+
      '  --environment-secret-file <path> Host environment credential\n'+
      '  --capacity <n>                 Concurrent sessions\n'+
      '  --base-dir <path>              Isolated sessions directory\n'+
      '  --exec-path <path>             Claude child executable\n'+
      '  --drain-wait-sec <n>           Wait before terminating active sessions\n')
    return
  }
  const secret=config.secretFile
    ? (await readFile(config.secretFile,'utf8')).trim()
    : process.env.SELF_HOSTED_RUNNER_ENVIRONMENT_SECRET?.trim()
  if(!secret) throw new Error('Self-hosted runner requires an environment secret')
  const api=new SelfHostedRunnerApi317({baseUrl:config.apiUrl,poolSecret:secret})
  const controller=new AbortController()
  const onTerm=()=>controller.abort()
  process.on('SIGINT',onTerm)
  process.on('SIGTERM',onTerm)
  try{
    const executable = config.execPath
    const isScriptRuntime=/[\\/]bun(?:\.exe)?$/i.test(executable)
    const args = isScriptRuntime && process.argv[1] ? [process.argv[1]] : []
    await startSelfHostedRunnerHost317({api,capacity:config.capacity,baseDir:config.baseDir,
      execPath:executable,scriptArgs:args,env:process.env,
      pollIntervalMs:config.pollMs,drainWaitMs:config.drainMs,
      signal:controller.signal,onStatus:line=>process.stderr.write(line+'\n')})
  }finally{
    process.off('SIGINT',onTerm)
    process.off('SIGTERM',onTerm)
  }
}
