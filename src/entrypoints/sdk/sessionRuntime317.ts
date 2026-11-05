import type { JSONRPCMessage } from '@modelcontextprotocol/server'
import { SdkControlServerTransport } from '../../services/mcp/SdkControlTransport.js'
import { parseSdkTransportMessage } from '../../services/mcp/validateSdkTransportMessage.js'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline'
import { extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { SDKControlRequest, SDKControlRequestInner, SDKControlInitializeRequest, SDKControlCancelRequest, SDKControlResponse } from './controlTypes.js'
import type { SDKMessage, SDKUserMessage } from './coreTypes.js'
import type { HookCallback, InternalOptions, SDKSessionOptions } from './runtimeTypes.js'
import { prepareExternalSession317, SDK_SESSION_UUID } from './externalSessionStore317.js'
import type { StdoutMessage } from './controlTypes.js'
import { Stream } from '../../utils/stream.js'

type ExternalSession = Awaited<ReturnType<typeof prepareExternalSession317>>

export function createSessionRuntime317(
  options: SDKSessionOptions | InternalOptions,
  resume?: string,
) {
  if (resume !== undefined && !SDK_SESSION_UUID.test(resume)) throw new TypeError('Invalid session ID')
  const sessionId = resume ?? randomUUID()
  if (!options.sessionStore) return startSession(options, sessionId, resume)
  if ((options as InternalOptions).noSessionPersistence || (options as InternalOptions).clientDataUrl) {
    throw new Error('SessionStore requires locally persisted SDK transcripts')
  }
  let closed = false
  const ready = prepareExternalSession317(options, resume).then(async external => {
    try {
      if (closed) throw new Error('SDK session is closed')
      const session = startSession(options, external.resume ?? sessionId, external.resume, external)
      const cleanup = session.exited.then(() => external.cleanup())
      void cleanup.catch(error => session.fail(error))
      return {
        ...session,
        async closeAndWait(): Promise<void> {
          await session.closeAndWait()
          await cleanup
        },
      }
    } catch (error) {
      await external.cleanup()
      throw error
    }
  })
  const initialization = ready.then(session => session.initialization)
  void initialization.catch(() => {})
  return {
    sessionId,
    initialization,
    async control(request: SDKControlRequestInner) { return (await ready).control(request) },
    async send(message: string | SDKUserMessage) { await (await ready).send(message) },
    async *stream() { yield* (await ready).stream() },
    close() {
      closed = true
      void ready.then(session => session.close(), () => {})
    },
    async closeAndWait(): Promise<void> {
      closed = true
      const session = await ready
      await session.closeAndWait()
    },
  }
}

function startSession(
  options: SDKSessionOptions | InternalOptions,
  sessionId: string,
  resume?: string,
  external?: ExternalSession,
) {
  const path = options.pathToClaudeCodeExecutable ??
    fileURLToPath(new URL('../../../dist/launcher.cjs', import.meta.url))
  const interpreter = options.executable ??
    (/^\.(?:js|mjs|cjs)$/.test(extname(path)) ? 'node' : undefined)
  const args = [
    ...(options.executableArgs ?? []),
    ...(interpreter ? [path] : []),
    '--print', '--verbose', '--input-format', 'stream-json',
    '--output-format', 'stream-json',
  ]
  const queryOptions: InternalOptions = options
  if (external) args.push('--session-mirror')
  if (options.model) args.push('--model', options.model)
  if (resume) args.push('--resume', resume)
  else if (queryOptions.continue && !external) args.push('--continue')
  else args.push('--session-id', sessionId)
  const valueFlags = {
    '--fallback-model': queryOptions.fallbackModel,
    '--effort': queryOptions.effort,
    '--max-turns': queryOptions.maxTurns,
    '--max-budget-usd': queryOptions.maxBudgetUsd,
    '--resume-session-at': queryOptions.resumeSessionAt,
    '--settings': queryOptions.settings,
    '--debug-file': queryOptions.debugFile,
    '--sdk-url': queryOptions.clientDataUrl,
    '--thinking': queryOptions.thinking?.type,
  }
  for (const [flag, value] of Object.entries(valueFlags)) {
    if (value !== undefined) args.push(flag, String(value))
  }
  const switches = {
    '--fork-session': queryOptions.forkSession,
    '--include-partial-messages': queryOptions.includePartialMessages,
    '--replay-user-messages': queryOptions.replayUserMessages,
    '--no-session-persistence': queryOptions.noSessionPersistence,
    '--strict-mcp-config': queryOptions.strictMcpConfig,
    '--allow-dangerously-skip-permissions': queryOptions.allowDangerouslySkipPermissions,
    '--debug': queryOptions.debug,
    '--enable-auth-status': queryOptions.enableAuthStatus,
    '--forward-subagent-text': queryOptions.forwardSubagentText,
  }
  for (const [flag, enabled] of Object.entries(switches)) if (enabled) args.push(flag)
  if (Array.isArray(queryOptions.tools)) args.push('--tools', queryOptions.tools.join(','))
  for (const dir of queryOptions.additionalDirectories ?? []) args.push('--add-dir', dir)
  for (const plugin of queryOptions.plugins ?? []) args.push('--plugin-dir', plugin.path)
  const sdkServers = new Map<string, {
    transport: SdkControlServerTransport
    pending: Map<string | number, (message: JSONRPCMessage) => void>
    connect: () => Promise<void>
  }>()
  const externalServers = Object.fromEntries(Object.entries(queryOptions.mcpServers ?? {}).filter(([name, server]) => {
    if (server.type !== 'sdk') return true
    if (!('instance' in server)) throw new Error('Missing SDK MCP server instance: ' + name)
    const pending = new Map<string | number, (message: JSONRPCMessage) => void>()
    const transport = new SdkControlServerTransport(message => {
      if ('id' in message && !('method' in message)) pending.get(message.id)?.(message)
      else void control({ subtype: 'mcp_message', server_name: name, message }).catch(fail)
    })
    sdkServers.set(name, { transport, pending, connect: () => server.instance.connect(transport) })
    return false
  }))
  if (Object.keys(externalServers).length) {
    args.push('--mcp-config', JSON.stringify({ mcpServers: externalServers }))
  }
  const permissionTool = options.canUseTool ? 'stdio' : queryOptions.permissionPromptToolName
  if (permissionTool) args.push('--permission-prompt-tool', permissionTool)
  if (options.permissionMode) args.push('--permission-mode', options.permissionMode)
  if (options.settingSources) args.push('--setting-sources', options.settingSources.join(','))
  if (options.allowedTools?.length) args.push('--allowedTools', options.allowedTools.join(','))
  if (options.disallowedTools?.length) args.push('--disallowedTools', options.disallowedTools.join(','))

  const child = spawn(interpreter ?? path, args, {
    cwd: options.cwd,
    env: {
      ...process.env, ...options.env, CLAUDE_CODE_ENTRYPOINT: 'sdk-ts',
      ...(external && { CLAUDE_CONFIG_DIR: external.root }),
    },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  })
  let stderr = ''
  child.stderr.setEncoding('utf8').on('data', chunk => {
    stderr = (stderr + chunk).slice(-8192)
    queryOptions.stderr?.(chunk)
  })
  let failure: Error | undefined
  child.on('error', error => { failure = error })
  child.stdin.on('error', error => { failure ??= error })
  const exited = new Promise<void>(resolve => {
    child.once('close', (code, signal) => {
      if (code !== 0) {
        failure ??= new Error(`Claude CLI exited with ${signal ?? code}${stderr ? ': ' + stderr.trim() : ''}`)
      }
      resolve()
    })
  })
  const reader = createInterface({ input: child.stdout, crlfDelay: Infinity })
  const messages = new Stream<SDKMessage>()
  let closed = false
  let transportClosure: Promise<void> = Promise.resolve()
  let pending = false
  let reading = false

  const permissions = new Map<string, AbortController>()
  const callbacks = new Map<string, HookCallback>()
  const requests = new Map<string, {
    resolve: (result: Record<string, unknown>) => void
    reject: (error: Error) => void
  }>()
  const hooks = Object.fromEntries(Object.entries(options.hooks ?? {}).map(([event, matchers]) => [
    event,
    matchers.map(({ hooks, ...matcher }) => ({
      ...matcher,
      hookCallbackIds: hooks.map(callback => {
        const id = randomUUID()
        callbacks.set(id, callback)
        return id
      }),
    })),
  ])) as SDKControlInitializeRequest['hooks']

  function control(request: SDKControlRequestInner): Promise<Record<string, unknown>> {
    if (closed) return Promise.reject(failure ?? new Error('SDK session is closed'))
    const request_id = randomUUID()
    return new Promise((resolve, reject) => {
      requests.set(request_id, { resolve, reject })
      void write({ type: 'control_request', request_id, request }).catch(error => {
        requests.delete(request_id)
        reject(error)
      })
    })
  }

  function write(frame: SDKUserMessage | SDKControlResponse | SDKControlRequest): Promise<void> {
    const payload = JSON.stringify(frame) + '\n'
    return new Promise((resolve, reject) => {
      child.stdin.write(payload, error => error ? reject(error) : resolve())
    })
  }

  async function respondToControl({ request_id, request }: SDKControlRequest): Promise<void> {
    const controller = new AbortController()
    permissions.set(request_id, controller)
    try {
      let response: SDKControlResponse['response']
      try {
        let decision: Record<string, unknown>
        if (request.subtype === 'can_use_tool' && options.canUseTool) {
          decision = await options.canUseTool(request.tool_name, request.input, {
            signal: controller.signal,
            suggestions: request.permission_suggestions,
            toolUseID: request.tool_use_id,
          })
        } else if (request.subtype === 'mcp_message') {
          const server = sdkServers.get(request.server_name)
          if (!server?.transport.onmessage) throw new Error('SDK MCP server is disconnected: ' + request.server_name)
          const message = parseSdkTransportMessage(request.message)
          if ('method' in message && 'id' in message) {
            const id = message.id
            if (server.pending.has(id)) throw new Error('Duplicate SDK MCP request ID')
            try {
              const mcp_response = await new Promise<JSONRPCMessage>((resolve, reject) => {
                controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true })
                server.pending.set(id, resolve)
                server.transport.onmessage!(message)
              })
              decision = { mcp_response }
            } finally {
              server.pending.delete(id)
            }
          } else {
            server.transport.onmessage(message)
            decision = { mcp_response: null }
          }
        } else if (request.subtype === 'hook_callback') {
          const callback = callbacks.get(request.callback_id)
          if (!callback) throw new Error('Unknown SDK hook callback')
          decision = await callback(request.input, request.tool_use_id, { signal: controller.signal })
        } else {
          throw new Error(`Unsupported SDK control request: ${request.subtype}`)
        }
        response = { subtype: 'success', request_id, response: decision }
      } catch (error) {
        response = {
          subtype: 'error', request_id,
          error: error instanceof Error ? error.message : String(error),
        }
      }
      if (!controller.signal.aborted) await write({ type: 'control_response', response })
    } finally {
      permissions.delete(request_id)
    }
  }

  function close(): void {
    if (closed) return
    closed = true
    for (const controller of permissions.values()) controller.abort()
    permissions.clear()
    const closeOps = [...sdkServers.values()].map(server => server.transport.close())
    transportClosure = Promise.allSettled(closeOps).then(results => {
      const rejected = results.find(result => result.status === 'rejected')
      if (rejected?.status === 'rejected') throw rejected.reason
    })
    // Existing synchronous close() callers retain their API; async failure is
    // stored and can be observed by the explicit closeAndWait() lifecycle API.
    void transportClosure.catch(error => {
      failure ??= error instanceof Error ? error : new Error(String(error))
      queryOptions.stderr?.(`SDK MCP transport shutdown failed: ${String(error)}`)
    })
    for (const request of requests.values()) request.reject(failure ?? new Error('SDK session is closed'))
    requests.clear()
    if (failure) messages.error(failure)
    else messages.done()
    reader.close()
    child.stdin.destroy()
    if (child.exitCode === null && child.signalCode === null) child.kill()
  }

  async function closeAndWait(): Promise<void> {
    close()
    // Child 'close' fires after process exit AND stdio streams have closed,
    // which is necessary before a Windows workspace can be safely removed.
    await exited
    await transportClosure
  }

  async function pump(): Promise<void> {
    for await (const line of reader) {
      if (closed) return
      if (!line.trim()) continue
      const message: SDKMessage | SDKControlRequest | SDKControlCancelRequest | SDKControlResponse | Extract<StdoutMessage, { type: 'transcript_mirror' }> =
        JSON.parse(line)
      if (message.type === 'transcript_mirror') {
        if (!external) throw new Error('Unexpected SDK transcript mirror')
        await external.mirror(message.filePath, message.entries)
      } else if (message.type === 'control_request') {
        void respondToControl(message).catch(fail)
      } else if (message.type === 'control_cancel_request') {
        permissions.get(message.request_id)?.abort()
      } else if (message.type === 'control_response') {
        const reply = message.response
        const request = requests.get(reply.request_id)
        requests.delete(reply.request_id)
        if (reply.subtype === 'error') request?.reject(new Error(reply.error))
        else request?.resolve(reply.response ?? {})
      } else {
        messages.enqueue(message)
      }
    }
    await exited
    if (!closed) fail(failure ?? new Error('Claude CLI closed the SDK connection'))
  }

  function fail(error: unknown): void {
    failure ??= error instanceof Error ? error : new Error(String(error))
    close()
  }

  void pump().catch(fail)
  const initialization = Promise.all([...sdkServers.values()].map(server => server.connect())).then(() => control({
    subtype: 'initialize',
    sdkMcpServers: [...sdkServers.keys()],
    hooks,
    agents: queryOptions.agents,
    jsonSchema: queryOptions.outputFormat?.schema,
    systemPrompt: typeof queryOptions.systemPrompt === 'string' ? queryOptions.systemPrompt : undefined,
    appendSystemPrompt: queryOptions.appendSystemPrompt ??
      (typeof queryOptions.systemPrompt === 'object' ? queryOptions.systemPrompt.append : undefined),
  })).then(async result => {
    const tokens = queryOptions.thinking
      ? queryOptions.thinking.type === 'enabled' ? queryOptions.thinking.budgetTokens : undefined
      : queryOptions.maxThinkingTokens
    if (tokens !== undefined) {
      await control({ subtype: 'set_max_thinking_tokens', max_thinking_tokens: tokens })
    }
    return result
  })
  void initialization.catch(fail)

  return {
    sessionId,
    exited,
    fail,
    control,
    initialization,
    async send(message) {
      if (failure) throw failure
      if (closed) throw new Error('SDK session is closed')
      if (pending) throw new Error('Consume the current SDK turn before sending another message')
      const frame: SDKUserMessage = typeof message === 'string'
        ? {
            type: 'user',
            session_id: sessionId,
            parent_tool_use_id: null,
            message: { role: 'user', content: message },
          }
        : { ...message, session_id: sessionId }
      pending = true
      try {
        await initialization
        await write(frame)
      } catch (error) {
        close()
        throw error
      }
    },
    async *stream() {
      if (!pending || reading) throw new Error('No unread SDK turn')
      reading = true
      let completed = false
      try {
        while (!closed) {
          const next = await messages.next()
          if (next.done) return
          const message = next.value as SDKMessage
          if (message.type === 'result') {
            completed = true
            yield message
            return
          }
          yield message
        }
      } finally {
        reading = false
        pending = false
        if (!completed) close()
      }
    },
    close,
    closeAndWait,
  }
}
