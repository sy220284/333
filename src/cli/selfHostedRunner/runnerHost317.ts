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
import type { RunnerHostSnapshot317 } from './runnerHealth317.ts'
import { prepareRunnerWorkspace317, pushRunnerOutcomeBranches317 } from './runnerWorkspace317.ts'
import { mapRunnerRemoteCliArgs317, stageRunnerPromptFlags317, stageRunnerMcpConfig317 } from './runnerCliArgs317.ts'
import { stageRunnerAgentFiles317 } from './runnerAgents317.ts'
import { unlink } from 'node:fs/promises'
import type { SessionActivity } from '../../bridge/types.js'
import { checkRunnerIdleHold317, parseRunnerMinutes317, parseRunnerMilliseconds317,
  RUNNER_HOLD_DEFAULT_MS_317, RUNNER_HOLD_RECHECK_MS_317 } from './runnerIdleHold317.ts'

type RunnerInferenceAuth317 = { token:string; expiresInSeconds:number }
function runnerInferenceAuth317(remote: {inference_auth?:unknown},id:string):RunnerInferenceAuth317 {
  const raw=remote.inference_auth
  if(!raw || typeof raw!=='object' || Array.isArray(raw)) {
    throw new Error('Session '+id+' /remote response is missing inference_auth.access_token')
  }
  const value=raw as Record<string,unknown>
  if(typeof value.access_token!=='string' || value.access_token.length===0){
    throw new Error('Session '+id+' /remote response is missing inference_auth.access_token')
  }
  const ttl=value.expires_in_seconds
  if(ttl!==undefined && (typeof ttl!=='number' || !Number.isFinite(ttl) || ttl<=0)){
    throw new TypeError('Session '+id+' inference_auth.expires_in_seconds must be positive')
  }
  return {token:value.access_token,expiresInSeconds:typeof ttl==='number'?ttl:3600}
}

export type RunnerHostOptions317 = {
  api: SelfHostedRunnerApi317
  baseDir: string
  capacity: number
  execPath: string
  scriptArgs: string[]
  env: NodeJS.ProcessEnv
  pollIntervalMs?: number
  heartbeatIntervalMs?: number
  sessionTokenRefreshIntervalMs?: number
  inferenceTokenRefreshIntervalMs?: number
  drainWaitMs?: number
  idleReleaseMs?: number
  holdIdleFile?: string
  maxHoldMs?: number
  pushOutcomeOnRelease?: boolean
  clientLabel?: string
  lockToAccountId?: string
  signal?: AbortSignal
  onStatus?: (message: string) => void
  onStateChange?: (snapshot: RunnerHostSnapshot317) => void
  createChild?: (sessionId: string, sdkUrl: string, accessToken: string,
    epoch: number, cwd: string, environment: NodeJS.ProcessEnv,
    onTokenAck?: (requestId: string)=>void,
    onActivity?: (activity: SessionActivity)=>void) => SessionHandle
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
const HOST_ONLY_RUNNER_ENV_KEYS_317 = new Set([
  'SELF_HOSTED_RUNNER_ENVIRONMENT_SECRET',
  'SELF_HOSTED_RUNNER_POOL_SECRET',
  'SELF_HOSTED_RUNNER_WORK_ORDER_JWT',
])
function secureChildEnvironment(base: NodeJS.ProcessEnv, supplied: Record<string, unknown>): NodeJS.ProcessEnv {
  // Host credentials remain private even if a remote assignment attempts to
  // reintroduce a removed name in its environment_variables payload.
  const env = {...base}
  for (const key of HOST_ONLY_RUNNER_ENV_KEYS_317) delete env[key]
  delete env.CLAUDE_CODE_OAUTH_TOKEN
  for (const [key,value] of Object.entries(supplied)) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key) || typeof value !== 'string' || value.includes('\0')) {
      throw new Error('Runner remote configuration contains an invalid environment entry')
    }
    // Dynamic library injection and Node CLI option hooks must not come from
    // a session. Normal application environment still comes from the server.
    if (HOST_ONLY_RUNNER_ENV_KEYS_317.has(key) ||
        ['NODE_OPTIONS','BUN_OPTIONS','NODE_EXTRA_CA_CERTS','LD_PRELOAD',
          'DYLD_INSERT_LIBRARIES'].includes(key)) {
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
  if (options.heartbeatIntervalMs !== undefined &&
      (!Number.isSafeInteger(options.heartbeatIntervalMs) || options.heartbeatIntervalMs < 1)) {
    throw new RangeError('Runner heartbeat interval must be a positive integer')
  }
  if (options.sessionTokenRefreshIntervalMs !== undefined &&
      (!Number.isSafeInteger(options.sessionTokenRefreshIntervalMs) ||
       options.sessionTokenRefreshIntervalMs < 1)) {
    throw new RangeError('Session token refresh interval must be a positive integer')
  }
  if (options.inferenceTokenRefreshIntervalMs !== undefined &&
      (!Number.isSafeInteger(options.inferenceTokenRefreshIntervalMs) ||
       options.inferenceTokenRefreshIntervalMs < 1)) {
    throw new RangeError('Inference token refresh interval must be a positive integer')
  }
  for(const [name,value] of [
    ['idleReleaseMs',options.idleReleaseMs],['maxHoldMs',options.maxHoldMs],
  ] as const){
    if(value!==undefined && (!Number.isFinite(value)||value<0||value>10080*60_000))
      throw new RangeError(name+' must be between 0 and 10080 minutes')
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
  const emitState=()=>options.onStateChange?.({
    runnerId:runnerId||null,capacity:options.capacity,
    activeSessions:active.size,connected:Boolean(runnerId&&runnerToken),
  })
  emitState()

  const launch = async (id: string): Promise<void> => {
    safeSessionId(id)
    let remoteToken = ''
    let workerEpoch: number | undefined
    let remoteBase = ''
    let heartbeatTimer: ReturnType<typeof setInterval> | undefined
    let sessionRefreshTimer: ReturnType<typeof setInterval> | undefined
    let inferenceRefreshTimer: ReturnType<typeof setInterval> | undefined
    let sessionRefreshPending = false
    let inferenceRefreshPending = false
    let inferenceExpiresAt = 0
    let inferenceToken = ''
    const pendingTokenAcks=new Map<string,{label:string;sentAtMs:number}>()
    let tokenAckSerial=0
    const registerTokenAck=(label:string):string=>{
      const requestId='shr-token-'+label+'-'+(++tokenAckSerial)
      pendingTokenAcks.set(requestId,{label,sentAtMs:Date.now()})
      return requestId
    }
    const onTokenAck=(requestId:string):void=>{
      const pending=pendingTokenAcks.get(requestId)
      if(!pending)return
      pendingTokenAcks.delete(requestId)
      status('[runner:session] '+pending.label+' update acked by child for '+id)
    }
    const checkPendingAcks=():void=>{
      const now=Date.now()
      for(const [requestId,pending] of pendingTokenAcks){
        if(now-pending.sentAtMs<90_000)continue
        pendingTokenAcks.delete(requestId)
        status('[runner:session] WARNING: '+pending.label+
          ' update for '+id+' was not acknowledged by child within 90s')
      }
    }
    let heartbeatPending = false
    let stagedPromptFiles:string[]=[]
    const heartbeatAbort = new AbortController()
    let idleTimer: ReturnType<typeof setTimeout> | undefined
    let idleSince = 0
    let idleVersion = 0
    let idleReleased = false
    let idleCheckFailures = 0
    let sessionHandle: SessionHandle | undefined
    const idleInterval = options.idleReleaseMs ?? 0
    const holdDeadline = options.maxHoldMs ?? RUNNER_HOLD_DEFAULT_MS_317
    const cancelIdle = () => {
      idleVersion++
      idleSince=0
      idleCheckFailures=0
      if(idleTimer)clearTimeout(idleTimer)
      idleTimer=undefined
    }
    const scheduleIdle = (delay:number,version:number) => {
      if(idleTimer)clearTimeout(idleTimer)
      idleTimer=setTimeout(()=>{void tryReleaseIdle(version)},Math.max(1,delay))
      idleTimer.unref?.()
    }
    async function tryReleaseIdle(version:number): Promise<void> {
      idleTimer=undefined
      if(version!==idleVersion || idleSince===0 || !sessionHandle ||
          ownedAbort.signal.aborted || heartbeatAbort.signal.aborted || idleReleased)return
      const elapsed=Date.now()-idleSince
      if(elapsed<idleInterval){scheduleIdle(idleInterval-elapsed,version);return}
      if(options.holdIdleFile && holdDeadline>idleInterval && holdDeadline>0 && elapsed<holdDeadline){
        try {
          let timeout: ReturnType<typeof setTimeout> | undefined
          const held=await (async()=>{
            try{return await Promise.race([
              checkRunnerIdleHold317(options.holdIdleFile!),
              new Promise<boolean>((_,reject)=>{
                timeout=setTimeout(()=>reject(new Error('hold marker check timeout')),2_000)
                timeout.unref?.()
              }),
            ])}
            finally{if(timeout)clearTimeout(timeout)}
          })()
          if(version!==idleVersion || ownedAbort.signal.aborted || heartbeatAbort.signal.aborted)return
          if(held){
            idleCheckFailures=0
            scheduleIdle(Math.min(RUNNER_HOLD_RECHECK_MS_317,holdDeadline-elapsed),version)
            return
          }
        } catch(error) {
          if(version!==idleVersion)return
          status('[runner:session] idle marker inspection failed for '+id+': '+
            (error instanceof Error?error.message:String(error)))
          if(++idleCheckFailures===1){scheduleIdle(2_000,version);return}
        }
      }
      if(version!==idleVersion || ownedAbort.signal.aborted || heartbeatAbort.signal.aborted)return
      try {
        const outcome=await options.api.releaseSession(runnerToken,id)
        if(version!==idleVersion)return
        if(!outcome.released){
          status('[runner:session] server declined idle release for '+id)
          scheduleIdle(RUNNER_HOLD_RECHECK_MS_317,version)
          return
        }
        idleReleased=true
        status('[runner:session] '+id+' idle session released')
        sessionHandle.kill()
      }catch(error){
        if(version!==idleVersion || ownedAbort.signal.aborted)return
        status('[runner:session] idle release failed for '+id+': '+
          (error instanceof Error?error.message:String(error)))
        scheduleIdle(RUNNER_HOLD_RECHECK_MS_317,version)
      }
    }
    const onRunnerActivity = (activity: SessionActivity) => {
      if(idleInterval===0 || idleReleased)return
      if(activity.type==='result'){
        cancelIdle()
        idleSince=Date.now()
        scheduleIdle(idleInterval,idleVersion)
      } else {
        cancelIdle()
      }
    }
    try {
      const issued = await options.api.issueSessionToken(runnerToken,id,ownedAbort.signal)
      remoteToken = issued.session_token
      // Official 317 x64 does not initialize its injected tools-server hosting
      // capability; preserve its explicit rejection and never spawn a worker
      // that would omit FetchAttachment/PlaceFiles RPC capabilities.
      if (issued.tools_host) throw new Error(
        'Session '+id+' needs a tool server, which this runner cannot host')
      const remote = await options.api.getSessionRemoteConfig(id,remoteToken,ownedAbort.signal)
      const inference = runnerInferenceAuth317(remote,id)
      inferenceToken=inference.token
      inferenceExpiresAt=Date.now()+inference.expiresInSeconds*1000
      // Reconstruct the official prep path: verified sources, target branches,
      // isolated checkout, then start the same session worker from its repo.
      remoteBase = remote.api_base_url ?? ''
      if (!remoteBase) throw new Error('Assignment lacks api_base_url')
      const cwd = sessionDirectory(root,id)
      const sessionConfigDir = sessionDirectory(join(root,'_sessions'),id)
      await mkdir(cwd,{recursive:true,mode:0o700})
      await mkdir(sessionConfigDir,{recursive:true,mode:0o700})
      const env = secureChildEnvironment(options.env,remote.environment_variables)
      workerEpoch = await options.api.registerWorker(remoteBase,id,remoteToken,ownedAbort.signal)
      // 317: the worker epoch is acknowledged before the CLI is launched.
      await options.api.updateSessionWorkerState(remoteBase,id,remoteToken,workerEpoch,
        undefined,ownedAbort.signal)
      const heartbeatSignal = AbortSignal.any([ownedAbort.signal,heartbeatAbort.signal])
      const epoch = workerEpoch
      heartbeatTimer = setInterval(() => {
        if (heartbeatSignal.aborted || heartbeatPending) return
        heartbeatPending = true
        void options.api.heartbeat(remoteBase,id,remoteToken,epoch,heartbeatSignal)
          .catch(error => {
            if (!heartbeatSignal.aborted) status('[runner:session] '+id+' heartbeat error: '+
              (error instanceof Error ? error.message : String(error)))
          }).finally(() => { heartbeatPending = false })
      },options.heartbeatIntervalMs ?? 30_000)
      heartbeatTimer.unref?.()
      const prepared = await prepareRunnerWorkspace317({
        root:cwd, sources:remote.sources, pushTargets:remote.push_targets,
        requestedCwd:remote.cwd, signal:ownedAbort.signal,
        workerEpoch, onStatus:status,
      })
      const childCwd = prepared.cwd
      const promptFlags=await stageRunnerPromptFlags317(
        remote.claude_code_args,sessionConfigDir,options.execPath===process.execPath)
      stagedPromptFiles=promptFlags.paths
      const mcpFlags=await stageRunnerMcpConfig317(
        remote.mcp_config,sessionConfigDir)
      stagedPromptFiles=[...stagedPromptFiles,...mcpFlags.paths]
      const agents=await stageRunnerAgentFiles317(
        remote.agent_files ?? [],remote.claude_code_args.agents,sessionConfigDir)
      stagedPromptFiles=[...stagedPromptFiles,...agents.paths]
      const deliveredCliArgs=[
        ...promptFlags.args,
        ...mcpFlags.args,
        ...agents.args,
        ...mapRunnerRemoteCliArgs317(remote.claude_code_args,status),
      ]
      const sdkUrl = new URL('/v1/code/sessions/'+encodeURIComponent(id),remoteBase).toString()
      const handle = options.createChild
        ? options.createChild(id,sdkUrl,remoteToken,workerEpoch,childCwd,env,onTokenAck,onRunnerActivity)
        : createSessionSpawner({
            execPath:options.execPath,scriptArgs:options.scriptArgs,
            additionalArgs:deliveredCliArgs,
            additionalDirs:prepared.addDirs,
            env,verbose:false,sandbox:false,onDebug:status,
            onTokenAck:(_sessionId,requestId)=>onTokenAck(requestId),
            onActivity:(_sessionId,activity)=>onRunnerActivity(activity),
            debugFile:join(sessionConfigDir,'claude-code-debug.txt'),
            runnerRuntime:{apiBaseUrl:remoteBase,configDir:sessionConfigDir,
              inferenceToken},
          }).spawn({
            sessionId:id,sdkUrl,accessToken:remoteToken,useCcrV2:true,
            workerEpoch,
          },childCwd)
      sessionHandle=handle
      status('[runner:session] started '+id)
      // A worker's session_token expires independently of the runner_token.
      // Refresh the session credential and notify the live CCR v2 child.
      // The same variable is used by heartbeat, so both paths rotate together.
      sessionRefreshTimer=setInterval(()=>{
        checkPendingAcks()
        if(heartbeatAbort.signal.aborted || ownedAbort.signal.aborted ||
           sessionRefreshPending || !runnerTokenNeedsRefresh(remoteToken,Date.now())) return
        sessionRefreshPending=true
        const staleToken=remoteToken
        void options.api.refreshToken(staleToken).then(next=>{
          if(heartbeatAbort.signal.aborted || ownedAbort.signal.aborted ||
             remoteToken!==staleToken) return
          const requestId=registerTokenAck('session_token')
          handle.updateAccessToken(next.token,requestId)
          remoteToken=next.token
          status('[runner:session] refreshed session token for '+id)
        }).catch(error=>{
          if(!heartbeatAbort.signal.aborted && !ownedAbort.signal.aborted)
            status('[runner:session] session token refresh failed for '+id+': '+
              (error instanceof Error?error.message:String(error)))
        }).finally(()=>{sessionRefreshPending=false})
      },options.sessionTokenRefreshIntervalMs ?? 30_000)
      sessionRefreshTimer.unref?.()
      // /remote owns the inference credential and its lifetime, independent
      // of the session token. Refresh before expiry and update the child in
      // place, preserving its conversation and tool state.
      inferenceRefreshTimer=setInterval(()=>{
        checkPendingAcks()
        if(heartbeatAbort.signal.aborted || ownedAbort.signal.aborted ||
           inferenceRefreshPending || Date.now()+60_000<inferenceExpiresAt) return
        inferenceRefreshPending=true
        void options.api.getSessionRemoteConfig(id,remoteToken,ownedAbort.signal)
          .then(config=>{
            if(heartbeatAbort.signal.aborted || ownedAbort.signal.aborted)return
            const fresh=runnerInferenceAuth317(config,id)
            if(fresh.token!==inferenceToken) {
              const requestId=registerTokenAck('inference_token')
              handle.writeStdin(JSON.stringify({
                type:'update_environment_variables',request_id:requestId,
                variables:{CLAUDE_CODE_OAUTH_TOKEN:fresh.token},
              })+'\n')
              inferenceToken=fresh.token
              status('[runner:session] refreshed inference token for '+id)
            }
            inferenceExpiresAt=Date.now()+fresh.expiresInSeconds*1000
          }).catch(error=>{
            if(!heartbeatAbort.signal.aborted && !ownedAbort.signal.aborted)
              status('[runner:session] inference token refresh failed for '+id+': '+
                (error instanceof Error?error.message:String(error)))
          }).finally(()=>{inferenceRefreshPending=false})
      },options.inferenceTokenRefreshIntervalMs ?? 30_000)
      inferenceRefreshTimer.unref?.()
      const completion = (async () => {
        const result = await handle.done
        if (options.pushOutcomeOnRelease && result !== 'completed' && !idleReleased) {
          // Preserve interrupted/failed changes before releasing this worker.
          // This is deliberately opt-in, matching the official 317 CLI flag.
          await pushRunnerOutcomeBranches317(prepared.outcomeBranches,{onStatus:status})
        }
        if (idleReleased) {
          status('[runner:session] idle release already acknowledged for '+id)
        } else if (result === 'failed') {
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
      }).finally(async () => {
        heartbeatAbort.abort()
        cancelIdle()
        if (heartbeatTimer) clearInterval(heartbeatTimer)
        if (sessionRefreshTimer) clearInterval(sessionRefreshTimer)
        if (inferenceRefreshTimer) clearInterval(inferenceRefreshTimer)
        active.delete(id)
        emitState()
        pendingTokenAcks.clear()
        for(const path of stagedPromptFiles){
          try { await unlink(path) }
          catch(error) { status('[runner:session] prompt cleanup failed: '+
            (error instanceof Error?error.message:String(error))) }
        }
      })
      active.set(id,{handle,completion})
      emitState()
      // Observe the rejected completion without detaching an unhandled promise.
      void completion.catch(() => {})
    } catch (error) {
      heartbeatAbort.abort()
      if (heartbeatTimer) clearInterval(heartbeatTimer)
      if (sessionRefreshTimer) clearInterval(sessionRefreshTimer)
      if (inferenceRefreshTimer) clearInterval(inferenceRefreshTimer)
      pendingTokenAcks.clear()
      for(const path of stagedPromptFiles){
        try { await unlink(path) }
        catch(error) { status('[runner:session] prompt cleanup failed: '+
          (error instanceof Error?error.message:String(error))) }
      }
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
    const registered = await options.api.registerRunner({
      clientLabel: options.clientLabel ?? hostname(),
      ...(options.lockToAccountId && {lockToAccountId:options.lockToAccountId}),
    })
    runnerId=registered.runner_id
    runnerToken=registered.runner_token
    emitState()
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
        // Each admission consumes one capacity slot until preparation has
        // either installed an active session or finished reporting failure.
        // Launch the bounded batch together: a slow checkout must not hold
        // the other slots idle while their independent work is ready.
        const preparing: Promise<void>[] = []
        for (const id of poll.assignment_ids) {
          if (active.size + preparing.length >= options.capacity ||
              active.has(id) || retained.has(id)) continue
          retained.add(id)
          preparing.push(launch(id))
        }
        // Join *all* preparations before the next poll or host teardown.
        // Promise.all() would reject early and detach the other in-flight
        // setups from the shutdown lifecycle.
        const outcomes = await Promise.allSettled(preparing)
        const rejected = outcomes.find(
          (outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected')
        if (rejected) throw rejected.reason
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
    runnerToken=''
    runnerId=''
    emitState()
  }
}

export class RunnerUsageError317 extends Error {
  readonly exitCode = 2
  readonly name = 'RunnerUsageError317'
}
type CliOptions = { apiUrl: string; secretFile?: string; capacity: number; baseDir: string;
  execPath: string; pollMs: number; drainMs: number; pushOutcomeOnRelease: boolean;
  idleReleaseMs: number; holdIdleFile?: string; maxHoldMs: number;
  clientLabel?: string;
  lockToAccountId?: string; agentProxyUrl?: string }
function parseArgs(argv: readonly string[], env: NodeJS.ProcessEnv): CliOptions | 'help' {
  const minutes=(value:string,flag:string):number=>{
    try{return parseRunnerMinutes317(value,flag)}
    catch(error){throw new RunnerUsageError317(error instanceof Error?error.message:String(error))}
  }
  if (argv.includes('--help') || argv.includes('-h')) return 'help'
  const parsed: CliOptions = {
    apiUrl: env.SELF_HOSTED_RUNNER_API_URL ?? 'https://api.anthropic.com',
    capacity:Number(env.SELF_HOSTED_RUNNER_CAPACITY ?? 1),
    baseDir:env.SELF_HOSTED_RUNNER_BASE_DIR ?? (process.platform === 'win32' ? '' : '/workspace'),
    execPath:env.SELF_HOSTED_RUNNER_EXEC_PATH ?? process.execPath,pollMs:2000,
    drainMs:Number(env.SELF_HOSTED_RUNNER_DRAIN_WAIT_MS ?? 0),
    pushOutcomeOnRelease:['true','1'].includes(
      (env.SELF_HOSTED_RUNNER_PUSH_OUTCOME_ON_RELEASE ?? '').toLowerCase()),
    clientLabel:env.SELF_HOSTED_RUNNER_CLIENT_LABEL,
    lockToAccountId:env.SELF_HOSTED_RUNNER_LOCK_TO_ACCOUNT,
    agentProxyUrl:env.SELF_HOSTED_RUNNER_AGENT_PROXY_URL,
    idleReleaseMs:parseRunnerMilliseconds317(env.SELF_HOSTED_RUNNER_SESSION_IDLE_MS,'SELF_HOSTED_RUNNER_SESSION_IDLE_MS'),
    holdIdleFile:env.SELF_HOSTED_RUNNER_HOLD_IDLE_FILE,
    maxHoldMs:parseRunnerMilliseconds317(env.SELF_HOSTED_RUNNER_MAX_HOLD_MS,
      'SELF_HOSTED_RUNNER_MAX_HOLD_MS',RUNNER_HOLD_DEFAULT_MS_317),
  }
  for(let i=0;i<argv.length;i++){
    const flag=argv[i]
    if(flag==='--push-outcome-on-release'){
      parsed.pushOutcomeOnRelease=true
      continue
    }
    if(!['--api-url','--environment-secret-file','--pool-secret-file',
      '--capacity','--base-dir','--exec-path','--client-label','--lock-to-account',
      '--agent-proxy-url','--poll-interval-ms','--drain-wait-sec',
      '--drain-wait-bg-tasks-sec','--release-idle-session-min',
      '--hold-idle-file','--max-hold-min'].includes(flag)){
      throw new RunnerUsageError317('unknown flag '+flag)
    }
    const value=argv[++i]
    if(!value || value.startsWith('--')) throw new RunnerUsageError317(flag==='--hold-idle-file'
      ? flag+' requires a file path (a file your host keeps fresh while the session has processes left running), got: nothing'
      : 'flag '+flag+' requires a value')
    switch(flag){
      case '--api-url': parsed.apiUrl=value;break
      case '--environment-secret-file':
      case '--pool-secret-file': parsed.secretFile=value;break
      case '--capacity': parsed.capacity=Number(value);break
      case '--base-dir': parsed.baseDir=value;break
      case '--exec-path': parsed.execPath=value;break
      case '--client-label': parsed.clientLabel=value;break
      case '--lock-to-account': parsed.lockToAccountId=value;break
      case '--agent-proxy-url': parsed.agentProxyUrl=value;break
      case '--poll-interval-ms': parsed.pollMs=Number(value);break
      case '--release-idle-session-min':
        parsed.idleReleaseMs=minutes(value,flag);break
      case '--hold-idle-file': parsed.holdIdleFile=resolve(value);break
      case '--max-hold-min': parsed.maxHoldMs=minutes(value,flag);break
      case '--drain-wait-sec':
      case '--drain-wait-bg-tasks-sec': parsed.drainMs=Number(value)*1000;break
    }
  }
  if(!Number.isSafeInteger(parsed.capacity) || parsed.capacity<1) {
    throw new RunnerUsageError317('--capacity must be a positive integer, got: '+String(parsed.capacity))
  }
  if(!parsed.baseDir) throw new RunnerUsageError317('--base-dir is required on Windows')
  if(parsed.agentProxyUrl){
    const url=new URL(parsed.agentProxyUrl)
    if(url.protocol!=='https:' || url.username || url.password) {
      throw new RunnerUsageError317('--agent-proxy-url must use https:// and contain no embedded credentials')
    }
  }
  if(!Number.isSafeInteger(parsed.pollMs)||parsed.pollMs<250) throw new RunnerUsageError317('Invalid runner polling interval')
  if(!Number.isSafeInteger(parsed.drainMs)||parsed.drainMs<0) throw new RunnerUsageError317('Invalid runner drain wait')
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
      '  --drain-wait-sec <n>           Wait before terminating active sessions\n'+
      '  --release-idle-session-min <n> Release idle sessions after n minutes (0 disables)\n'+
      '  --hold-idle-file <path>        Keep idle sessions while a local marker is fresh\n'+
      '  --max-hold-min <n>             Max idle hold window in minutes (default 1440)\n'+
      '  --push-outcome-on-release     Preserve unfinished outcome commits on shutdown\n')
    return
  }
  let secret: string | undefined
  if (config.secretFile) {
    try { secret=(await readFile(config.secretFile,'utf8')).trim() }
    catch (error) {
      throw new RunnerUsageError317('Failed to read environment secret file '+
        config.secretFile+' ('+(error instanceof Error ? error.message : String(error))+')')
    }
  } else {
    secret=(process.env.SELF_HOSTED_RUNNER_ENVIRONMENT_SECRET ??
      process.env.SELF_HOSTED_RUNNER_POOL_SECRET)?.trim()
  }
  if(!secret) throw new RunnerUsageError317(
    'No environment secret provided. Use --environment-secret-file or set SELF_HOSTED_RUNNER_ENVIRONMENT_SECRET.')
  const api=new SelfHostedRunnerApi317({baseUrl:config.apiUrl,poolSecret:secret,
    agentProxyUrl:config.agentProxyUrl})
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
      idleReleaseMs:config.idleReleaseMs,holdIdleFile:config.holdIdleFile,
      maxHoldMs:config.maxHoldMs,
      pushOutcomeOnRelease:config.pushOutcomeOnRelease,
      clientLabel:config.clientLabel,lockToAccountId:config.lockToAccountId,
      signal:controller.signal,onStatus:line=>process.stderr.write(line+'\n')})
  }finally{
    process.off('SIGINT',onTerm)
    process.off('SIGTERM',onTerm)
  }
}
