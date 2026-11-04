/**
 * 2.1.317 self-hosted runner wire contract.
 * Source: official Linux x64 chunk-mn2j77dt.js lUn(), lines 70-159.
 * This client owns request validation, status classification and credential scope.
 */
export type RunnerErrorKind317 = 'auth' | 'disabled' | 'not_found' | 'epoch' | 'rate_limit' | 'server'
export class RunnerHttpError317 extends Error {
  readonly name = 'RunnerHttpError317'
  constructor(
    readonly operation: string,
    readonly httpStatus: number,
    readonly kind: RunnerErrorKind317,
    readonly errorType?: string,
    readonly errorReason?: string,
    readonly resourceType?: string,
  ) {
    super(operation + ': ' + kind + ' (' + httpStatus + ')' + (errorType ? ' ' + errorType : ''))
  }
  get isAuthFailure(): boolean { return this.kind === 'auth' || this.kind === 'disabled' }
  get isEpochMismatch(): boolean { return this.kind === 'epoch' }
  get isSessionNotActive(): boolean { return this.errorType === 'session_not_active' }
  get isSelfHostedDisabledByOrg(): boolean { return this.kind === 'disabled' }
  get isDispatchTokenRevoked(): boolean { return this.resourceType === 'dispatch_token_revoked' }
}

export type RunnerApiOptions317 = {
  baseUrl: string
  poolSecret: string
  capabilities?: readonly string[]
  agentProxyUrl?: string
  fetchImpl?: typeof fetch
  onDebug?: (message: string) => void
  userAgent?: string
}

export type RunnerRegistration317 = {
  runner_id: string
  runner_token: string
  [key: string]: unknown
}
export type PollWork317 = {
  assignment_ids: string[]
  lease_expires_at?: string
  session_assignments: unknown[]
  suggested_poll_interval?: string
}
export type SessionToolsHost317 = {
  tool_server_hosting: number
  api_base_url: string
  cwd?: string
}
export type SessionToken317 = { session_token: string; tools_host?: SessionToolsHost317 }
export type RemoteConfig317 = {
  sources: unknown[]
  push_targets: unknown[]
  claude_code_args: Record<string, unknown>
  environment_variables: Record<string, unknown>
  api_base_url?: string
  cwd?: string
  [key: string]: unknown
}
export type RunnerRegistrationOptions317 = {
  clientLabel?: string
  lockToAccountId?: string
  useAnthropicGitProxy?: boolean
  serverAutoModeLists?: 'all' | 'no-allow' | 'none'
}

const ID = /^[A-Za-z0-9_-]{1,256}$/
const VERSION = '2.1.317'
const ROOT = '/v1/code/runners/self-hosted'
type JsonObject = Record<string, unknown>
function object(value: unknown, description: string): JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(description + ': expected JSON object')
  }
  return value as JsonObject
}
function safeId(value: string, label: string): string {
  if (typeof value !== 'string' || !ID.test(value)) {
    throw new TypeError('Invalid ' + label + ': unsafe characters or length')
  }
  return value
}
function nonEmpty(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(label + ' is missing')
  return value
}
function optString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}
function classifyStatus(operation: string, status: number, payload: unknown): never {
  const body = payload !== null && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as JsonObject : {}
  const err = body.error !== null && typeof body.error === 'object' && !Array.isArray(body.error)
    ? body.error as JsonObject : {}
  const errorType = optString(err.type)
  const errorReason = optString(err.reason)
  const resource = optString(err.resource)
  const kind: RunnerErrorKind317 =
    status === 401 ? 'auth' :
    status === 403 ? resource === 'self_hosted_runners_disabled_by_org' ? 'disabled' : 'auth' :
    status === 404 ? 'not_found' :
    status === 409 ? 'epoch' :
    status === 429 ? 'rate_limit' : 'server'
  throw new RunnerHttpError317(operation, status, kind, errorType, errorReason,
    resource ?? optString(err.resource_type))
}
function joinSignal(signal: AbortSignal | undefined, timeoutMs: number): { signal: AbortSignal; dispose: () => void } {
  const timeout = AbortSignal.timeout(timeoutMs)
  return { signal: signal ? AbortSignal.any([signal, timeout]) : timeout, dispose: () => {} }
}

export class SelfHostedRunnerApi317 {
  private readonly rootUrl: string
  private readonly fetchImpl: typeof fetch
  private readonly capabilities: readonly string[]
  private readonly onDebug: (message: string) => void
  private readonly poolSecret: string
  private readonly userAgent: string
  private readonly agentProxyUrl?: string
  constructor(options: RunnerApiOptions317) {
    const base = new URL(options.baseUrl)
    if (base.protocol !== 'https:' && base.protocol !== 'http:') throw new TypeError('Invalid runner API protocol')
    if (base.username || base.password || base.search || base.hash) throw new TypeError('Runner API URL must not contain credentials or query')
    this.rootUrl = base.href.replace(/\/$/, '')
    this.poolSecret = nonEmpty(options.poolSecret, 'runner environment secret')
    this.capabilities = options.capabilities ?? []
    this.fetchImpl = options.fetchImpl ?? fetch
    this.onDebug = options.onDebug ?? (() => {})
    this.userAgent = options.userAgent ?? 'claude-code/' + VERSION
    this.agentProxyUrl = options.agentProxyUrl
  }

  private async request(
    operation: string, method: 'GET' | 'POST' | 'PUT', path: string,
    token: string, payload: unknown = undefined, signal?: AbortSignal,
    timeoutMs = 15_000, scope: 'runner' | 'worker' = 'runner',
  ): Promise<JsonObject> {
    const headers = new Headers({
      Authorization: 'Bearer ' + nonEmpty(token, 'session token'),
      'User-Agent': this.userAgent,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    })
    if (scope === 'runner') {
      headers.set('x-self-hosted-runner-version', VERSION)
    }
    if (operation === 'RegisterRunner') {
      headers.set('x-self-hosted-runner-capabilities', this.capabilities.join(','))
    }
    const controller = joinSignal(signal, timeoutMs)
    this.onDebug('[runner:api] ' + method + ' ' + path)
    try {
      const response = await this.fetchImpl(this.rootUrl + path, {
        method, headers, signal: controller.signal,
        ...(payload !== undefined && { body: JSON.stringify(payload) }),
      })
      const text = await response.text()
      let parsed: unknown
      try { parsed = text ? JSON.parse(text) as unknown : {} }
      catch { throw new Error(operation + ': response is not valid JSON') }
      if (response.status < 200 || response.status >= 300) {
        classifyStatus(operation, response.status, parsed)
      }
      return object(parsed, operation)
    } finally {
      controller.dispose()
    }
  }

  async registerRunner(options: RunnerRegistrationOptions317 = {}): Promise<RunnerRegistration317> {
    const mode = options.serverAutoModeLists ?? 'no-allow'
    const modes = {
      all: 'SERVER_AUTO_MODE_LISTS_ALL',
      'no-allow': 'SERVER_AUTO_MODE_LISTS_NO_ALLOW',
      none: 'SERVER_AUTO_MODE_LISTS_NONE',
    } as const
    const payload = {
      runner_version: VERSION,
      capabilities: [...this.capabilities],
      use_anthropic_git_proxy: options.useAnthropicGitProxy ?? false,
      server_auto_mode_lists: modes[mode],
      ...(options.clientLabel && { client_label: options.clientLabel }),
      ...(options.lockToAccountId && { lock_to_account_id: options.lockToAccountId }),
    }
    if (!payload.server_auto_mode_lists) throw new TypeError('Invalid runner auto mode lists')
    const result = await this.request('RegisterRunner', 'POST', ROOT + '/runners/register', this.poolSecret, payload)
    return { ...result, runner_id: safeId(result.runner_id as string, 'runner_id'),
      runner_token: nonEmpty(result.runner_token, 'runner_token') }
  }

  async pollWork(token: string, runnerId: string, availableCapacity: number, signal?: AbortSignal,
    wakeSource?: string): Promise<PollWork317> {
    if (!Number.isSafeInteger(availableCapacity) || availableCapacity < 0) {
      throw new RangeError('available_capacity must be a non-negative integer')
    }
    const response = await this.request('PollWork', 'POST',
      ROOT + '/runners/' + safeId(runnerId, 'runnerId') + '/poll', token,
      { available_capacity: availableCapacity, ...(wakeSource && {wake_source: wakeSource}) },
      signal, 10_000)
    if (response.assignment_ids != null && !Array.isArray(response.assignment_ids)) {
      throw new TypeError('PollWork: response assignment_ids is not an array')
    }
    const ids = response.assignment_ids ?? []
    if (!Array.isArray(ids) || !ids.every(id => typeof id === 'string' && ID.test(id))) {
      throw new TypeError('PollWork: response assignment_ids contains a malformed session id')
    }
    return { assignment_ids: ids as string[],
      session_assignments: Array.isArray(response.session_assignments) ? response.session_assignments : [],
      lease_expires_at: optString(response.lease_expires_at),
      suggested_poll_interval: optString(response.suggested_poll_interval) }
  }

  async issueSessionToken(token: string, sessionId: string, signal?: AbortSignal): Promise<SessionToken317> {
    const result = await this.request('IssueSessionToken', 'POST', ROOT + '/sessions/' +
      safeId(sessionId, 'sessionId') + '/token', token, {}, signal)
    const sessionToken = nonEmpty(result.session_token, 'session_token')
    if (result.tools_host == null) return { session_token: sessionToken }
    const host = object(result.tools_host, 'tools_host')
    const port = typeof host.tool_server_hosting === 'string'
      ? Number(host.tool_server_hosting) : host.tool_server_hosting
    if (!Number.isSafeInteger(port) || (port as number) < 1 ||
      typeof host.api_base_url !== 'string' || host.api_base_url.length === 0 ||
      (host.cwd != null && typeof host.cwd !== 'string')) {
      throw new TypeError('IssueSessionToken: invalid tools_host')
    }
    return { session_token: sessionToken, tools_host: {
      tool_server_hosting: port as number, api_base_url: host.api_base_url,
      ...(host.cwd != null && {cwd: host.cwd as string}),
    } }
  }

  async getSessionRemoteConfig(sessionId: string, sessionToken: string, signal?: AbortSignal): Promise<RemoteConfig317> {
    const suffix = this.agentProxyUrl ? '?agent_proxy_url=' + encodeURIComponent(this.agentProxyUrl) : ''
    const result = await this.request('GetSessionRemoteConfig', 'GET', '/v1/code/sessions/' +
      safeId(sessionId, 'sessionId') + '/remote' + suffix, sessionToken, undefined, signal, 15_000, 'worker')
    const sources = result.sources ?? []
    const targets = result.push_targets ?? []
    if (!Array.isArray(sources) || !Array.isArray(targets)) {
      throw new TypeError('GetSessionRemoteConfig: invalid source/target configuration')
    }
    return { ...result, sources, push_targets: targets,
      claude_code_args: object(result.claude_code_args ?? {}, 'claude_code_args'),
      environment_variables: object(result.environment_variables ?? {}, 'environment_variables') }
  }

  async registerWorker(baseUrl: string, sessionId: string, sessionToken: string,
    signal?: AbortSignal): Promise<number> {
    const result = await this.workerRequest('RegisterWorker', 'POST', baseUrl, sessionId,
      '/worker/register', sessionToken, { session_id: sessionId }, signal, 30_000)
    const epoch = typeof result.worker_epoch === 'number' ? result.worker_epoch :
      Number(result.worker_epoch)
    if (!Number.isSafeInteger(epoch) || epoch < 0) throw new TypeError('RegisterWorker: invalid worker_epoch')
    return epoch
  }

  private async workerRequest(operation: string, method: 'POST' | 'PUT', baseUrl: string,
    sessionId: string, suffix: string, token: string, payload: unknown,
    signal?: AbortSignal, timeoutMs = 15_000): Promise<JsonObject> {
    const api = new SelfHostedRunnerApi317({ baseUrl, poolSecret: token, fetchImpl: this.fetchImpl, onDebug: this.onDebug,
      userAgent: this.userAgent })
    return api.request(operation, method, '/v1/code/sessions/' + safeId(sessionId, 'sessionId') + suffix,
      token, payload, signal, timeoutMs, 'worker')
  }

  async updateSessionWorkerState(baseUrl: string, sessionId: string, token: string,
    epoch: number, status: string | {connectionStatus: string}, signal?: AbortSignal): Promise<void> {
    await this.workerRequest('UpdateSessionWorkerState', 'PUT', baseUrl, sessionId, '/worker',
      token, { worker_epoch: epoch, ...(typeof status === 'string'
        ? { worker_status: status } : { connection_status: status.connectionStatus }) }, signal)
  }

  async heartbeat(baseUrl: string, sessionId: string, token: string,
    epoch: number, signal?: AbortSignal): Promise<void> {
    await this.workerRequest('Heartbeat', 'POST', baseUrl, sessionId, '/worker/heartbeat',
      token, {worker_epoch: epoch}, signal, 10_000)
  }

  async postWorkerEvents(baseUrl: string, sessionId: string, token: string,
    epoch: number, events: readonly unknown[], signal?: AbortSignal): Promise<void> {
    await this.workerRequest('PostWorkerEvents', 'POST', baseUrl, sessionId, '/worker/events',
      token, {worker_epoch: epoch, events: events.map(payload => ({ payload }))}, signal)
  }

  async forwardDiagnostics(baseUrl: string, sessionId: string, token: string,
    epoch: number, lines: readonly string[]): Promise<void> {
    if (lines.length === 0) return
    await this.workerRequest('ForwardDiagnostics', 'POST', baseUrl, sessionId, '/worker/diagnostics',
      token, {worker_epoch: epoch, lines}, undefined, 30_000)
  }

  async releaseSession(token: string, sessionId: string): Promise<{released: boolean}> {
    const result = await this.request('ReleaseSession', 'POST',
      ROOT + '/sessions/' + safeId(sessionId, 'sessionId') + '/release', token, {})
    return { released: result.released == null ? true : result.released === true }
  }

  async reportSessionFailure(token: string, sessionId: string, reason: string,
    setupFailureKind?: string, failureKind?: string): Promise<JsonObject> {
    return this.request('ReportSessionFailure', 'POST', ROOT + '/sessions/' +
      safeId(sessionId, 'sessionId') + '/report-failure', token,
      { reason, ...(setupFailureKind && {setup_failure_kind: setupFailureKind}),
        ...(failureKind && {failure_kind: failureKind}) })
  }

  async refreshToken(token: string): Promise<{token: string; [key: string]: unknown}> {
    const result = await this.request('RefreshToken', 'POST', '/v1/code/auth/refresh', token, {})
    return { ...result, token: nonEmpty(result.token, 'token') }
  }

  async deregisterRunner(token: string, options: {reason?: string; drain_hold?: unknown} = {}): Promise<void> {
    await this.request('DeregisterRunner', 'POST', ROOT + '/deregister', token, options, undefined, 10_000)
  }
}
