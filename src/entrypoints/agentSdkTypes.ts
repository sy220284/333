/**
 * Main entrypoint for Claude Code Agent SDK types.
 *
 * This file re-exports the public SDK API from:
 * - sdk/coreTypes.ts - Common serializable types (messages, configs)
 * - sdk/runtimeTypes.ts - Non-serializable types (callbacks, interfaces)
 *
 * SDK builders who need control protocol types should import from
 * sdk/controlTypes.ts directly.
 */

import { McpServer } from "@modelcontextprotocol/server";
import { z } from 'zod/v4';
import { createSessionRuntime317 } from './sdk/sessionRuntime317.js'
import { watchDaemonScheduledTasks317, formatMissedDaemonTasks317 } from './sdk/daemonTasks317.js'
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/server";

// Control protocol types for SDK builders (bridge subpath consumers)
/** @alpha */
export type {
  SDKControlRequest,
  SDKControlResponse,
} from './sdk/controlTypes.js'
// Re-export core types (common serializable types)
export * from './sdk/coreTypes.js'
// Re-export runtime types (callbacks, interfaces with methods)
export type * from './sdk/runtimeTypes.js'

// Re-export settings types (generated from settings JSON schema)
export type { Settings } from './sdk/settingsTypes.generated.js'
// Re-export tool types (all marked @internal until SDK API stabilizes)
export type * from './sdk/toolTypes.js'

// ============================================================================
// Functions
// ============================================================================

import type {
  SDKMessage,
  SDKResultMessage,
  SDKSessionInfo,
  SDKUserMessage,
} from './sdk/coreTypes.js'
// Import types needed for function signatures
import type {
  AnyZodRawShape,
  ForkSessionOptions,
  ForkSessionResult,
  GetSessionInfoOptions,
  GetSessionMessagesOptions,
  InferShape,
  InternalOptions,
  InternalQuery,
  ListSessionsOptions,
  McpSdkServerConfigWithInstance,
  Options,
  Query,
  SDKSession,
  SDKSessionOptions,
  SdkMcpToolDefinition,
  SessionMessage,
  SessionMutationOptions,
} from './sdk/runtimeTypes.js'

export type {
  ListSessionsOptions,
  GetSessionInfoOptions,
  SessionMutationOptions,
  ForkSessionOptions,
  ForkSessionResult,
  SDKSessionInfo,
}

export function tool<Schema extends AnyZodRawShape>(
  name: string,
  description: string,
  inputSchema: Schema,
  handler: (
    args: InferShape<Schema>,
    extra: unknown,
  ) => Promise<CallToolResult>,
  extras?: {
    annotations?: ToolAnnotations
    searchHint?: string
    alwaysLoad?: boolean
  },
): SdkMcpToolDefinition<Schema> {
  if (!name.trim()) throw new TypeError('SDK tool name is required')
  if (typeof handler !== 'function') throw new TypeError('SDK tool handler is required')
  return { name, description, inputSchema, handler, ...(extras ?? {}) }
}

type CreateSdkMcpServerOptions = {
  name: string
  version?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools?: Array<SdkMcpToolDefinition<any>>
}

/**
 * Creates an MCP server instance that can be used with the SDK transport.
 * This allows SDK users to define custom tools that run in the same process.
 *
 * If your SDK MCP calls will run longer than 60s, override CLAUDE_CODE_STREAM_CLOSE_TIMEOUT
 */
export function createSdkMcpServer(
  options: CreateSdkMcpServerOptions,
): McpSdkServerConfigWithInstance {
  if (!options.name.trim()) throw new TypeError('SDK MCP server name is required')
  const instance = new McpServer({
    name: options.name,
    version: options.version ?? '1.0.0',
  })
  const registered = new Set<string>()
  for (const definition of options.tools ?? []) {
    if (registered.has(definition.name)) {
      throw new Error('Duplicate SDK MCP tool: ' + definition.name)
    }
    registered.add(definition.name)
    instance.registerTool(definition.name, {
      description: definition.description,
      inputSchema: z.object(definition.inputSchema),
      ...(definition.annotations && { annotations: definition.annotations }),
    }, (args, ctx) => definition.handler(args, ctx))
  }
  return { type: 'sdk', name: options.name, instance }
}

export class AbortError extends Error {}

/** @internal */
export function query(_params: {
  prompt: string | AsyncIterable<SDKUserMessage>
  options?: InternalOptions
}): InternalQuery
export function query(_params: {
  prompt: string | AsyncIterable<SDKUserMessage>
  options?: Options
}): Query
export function query({ prompt, options = {} }: {
  prompt: string | AsyncIterable<SDKUserMessage>
  options?: InternalOptions
}): InternalQuery {
  const session = createSessionRuntime317(options, options.resume)
  const signal = options.abortController?.signal
  const abort = () => session.close()
  signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted) abort()

  async function* read() {
    try {
      const input = typeof prompt === 'string' ? [prompt] : prompt
      for await (const message of input) {
        signal?.throwIfAborted()
        await session.send(message)
        yield* session.stream()
        signal?.throwIfAborted()
      }
    } finally {
      cleanup()
    }
  }

  function cleanup() {
    signal?.removeEventListener('abort', abort)
    session.close()
  }

  const generator = read()
  const finish = generator.return.bind(generator)
  return Object.assign(generator, {
    async return(value: void | PromiseLike<void>) {
      cleanup()
      return finish(value)
    },
    initializationResult: () => session.initialization,
    async interrupt() { await session.control({ subtype: 'interrupt' }) },
    async setPermissionMode(mode: Parameters<Query['setPermissionMode']>[0]) {
      await session.control({ subtype: 'set_permission_mode', mode })
    },
    async setModel(model?: string) { await session.control({ subtype: 'set_model', model }) },
    async setMaxThinkingTokens(max_thinking_tokens: number | null) {
      await session.control({ subtype: 'set_max_thinking_tokens', max_thinking_tokens })
    },
    async supportedCommands() {
      return (await session.initialization).commands as Awaited<ReturnType<Query['supportedCommands']>>
    },
    async supportedModels() {
      return (await session.initialization).models as Awaited<ReturnType<Query['supportedModels']>>
    },
    async mcpServerStatus() {
      return (await session.control({ subtype: 'mcp_status' })).mcpServers as Awaited<ReturnType<Query['mcpServerStatus']>>
    },
    async mcpReconnect(serverName: string) { await session.control({ subtype: 'mcp_reconnect', serverName }) },
    async mcpToggle(serverName: string, enabled: boolean) {
      await session.control({ subtype: 'mcp_toggle', serverName, enabled })
    },
    async rewindFiles(user_message_id: string) {
      return await session.control({ subtype: 'rewind_files', user_message_id }) as Awaited<ReturnType<Query['rewindFiles']>>
    },
  })
}

/**
 * V2 API - UNSTABLE
 * Create a persistent session for multi-turn conversations.
 * @alpha
 */
export function unstable_v2_createSession(
  options: SDKSessionOptions,
): SDKSession {
  return createSessionRuntime317(options)
}

/**
 * V2 API - UNSTABLE
 * Resume an existing session by ID.
 * @alpha
 */
export function unstable_v2_resumeSession(
  sessionId: string,
  options: SDKSessionOptions,
): SDKSession {
  return createSessionRuntime317(options, sessionId)
}

// @[MODEL LAUNCH]: Update the example model ID in this docstring.
/**
 * V2 API - UNSTABLE
 * One-shot convenience function for single prompts.
 * @alpha
 *
 * @example
 * ```typescript
 * const result = await unstable_v2_prompt("What files are here?", {
 *   model: 'claude-sonnet-4-6'
 * })
 * ```
 */
export async function unstable_v2_prompt(
  message: string,
  options: SDKSessionOptions,
): Promise<SDKResultMessage> {
  const session = unstable_v2_createSession(options)
  try {
    await session.send(message)
    for await (const event of session.stream()) {
      if (event.type === 'result') return event
    }
    throw new Error('SDK prompt ended without a result')
  } finally {
    session.close()
  }
}

/**
 * Reads a session's conversation messages from its JSONL transcript file.
 *
 * Parses the transcript, builds the conversation chain via parentUuid links,
 * and returns user/assistant messages in chronological order. Set
 * `includeSystemMessages: true` in options to also include system messages.
 *
 * @param sessionId - UUID of the session to read
 * @param options - Optional dir, limit, offset, and includeSystemMessages
 * @returns Array of messages, or empty array if session not found
 */
export async function getSessionMessages(
  sessionId: string,
  options?: GetSessionMessagesOptions,
): Promise<SessionMessage[]> {
  const { validateUuid, resolveSessionFilePath } = await import('../utils/sessionStoragePortable.js')
  const valid = validateUuid(sessionId)
  if (!valid) return []
  const file = await resolveSessionFilePath(valid, options?.dir)
  if (!file) return []
  const offset = options?.offset ?? 0
  const limit = options?.limit
  if (!Number.isSafeInteger(offset) || offset < 0 ||
      (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 0))) {
    throw new RangeError('Session message pagination requires non-negative integer limit and offset')
  }
  // Reuse the canonical transcript loader: parentUuid ordering, sibling
  // assistant blocks, parallel tool_results and compact boundaries all pass
  // through the same read path as --resume.
  const { loadTranscriptFromFile } = await import('../utils/sessionStorage.js')
  const log = await loadTranscriptFromFile(file.filePath)
  if (log.isSidechain) return []
  const messages: SessionMessage[] = []
  for (const entry of log.messages) {
    const uuid = entry.uuid
    if (!uuid) continue
    if (entry.type === 'user') {
      messages.push({ type: 'user', uuid, session_id: valid,
        message: entry.message } as SessionMessage)
    } else if (entry.type === 'assistant') {
      messages.push({ type: 'assistant', uuid, session_id: valid,
        message: entry.message, parent_tool_use_id: entry.parent_tool_use_id ?? null,
        ...(entry.error && {error: entry.error}),
      } as SessionMessage)
    } else if (entry.type === 'system' && options?.includeSystemMessages) {
      messages.push({...entry, uuid, session_id: valid} as unknown as SessionMessage)
    }
  }
  return messages.slice(offset, limit === undefined ? undefined : offset + limit)
}

/**
 * List sessions with metadata.
 *
 * When `dir` is provided, returns sessions for that project directory
 * and its git worktrees. When omitted, returns sessions across all
 * projects.
 *
 * Use `limit` and `offset` for pagination.
 *
 * @example
 * ```typescript
 * // List sessions for a specific project
 * const sessions = await listSessions({ dir: '/path/to/project' })
 *
 * // Paginate
 * const page1 = await listSessions({ limit: 50 })
 * const page2 = await listSessions({ limit: 50, offset: 50 })
 * ```
 */
export async function listSessions(
  options?: ListSessionsOptions,
): Promise<SDKSessionInfo[]> {
  const { listSessionsImpl } = await import('../utils/listSessionsImpl.js')
  return listSessionsImpl(options)
}

/**
 * Reads metadata for a single session by ID. Unlike `listSessions`, this only
 * reads the single session file rather than every session in the project.
 * Returns undefined if the session file is not found, is a sidechain session,
 * or has no extractable summary.
 *
 * @param sessionId - UUID of the session
 * @param options - `{ dir?: string }` project path; omit to search all project directories
 */
export async function getSessionInfo(
  sessionId: string,
  options?: GetSessionInfoOptions,
): Promise<SDKSessionInfo | undefined> {
  const { validateUuid, resolveSessionFilePath, readSessionLite } =
    await import('../utils/sessionStoragePortable.js')
  const valid = validateUuid(sessionId)
  if (!valid) return undefined
  const file = await resolveSessionFilePath(valid, options?.dir)
  if (!file) return undefined
  const lite = await readSessionLite(file.filePath)
  if (!lite) return undefined
  const { parseSessionInfoFromLite } = await import('../utils/listSessionsImpl.js')
  return parseSessionInfoFromLite(valid, lite, file.projectPath) ?? undefined
}

/**
 * Rename a session. Appends a custom-title entry to the session's JSONL file.
 * @param sessionId - UUID of the session
 * @param title - New title
 * @param options - `{ dir?: string }` project path; omit to search all projects
 */
export async function renameSession(
  sessionId: string,
  title: string,
  options?: SessionMutationOptions,
): Promise<void> {
  const { validateUuid, resolveSessionFilePath } = await import('../utils/sessionStoragePortable.js')
  const valid = validateUuid(sessionId)
  if (!valid) throw new TypeError('Invalid session ID')
  if (typeof title !== 'string' || title.length === 0) throw new TypeError('Title must be non-empty')
  const file = await resolveSessionFilePath(valid, options?.dir)
  if (!file) throw new Error('Session not found: ' + sessionId)
  const { saveCustomTitle } = await import('../utils/sessionStorage.js')
  await saveCustomTitle(valid, title, file.filePath)
}

/**
 * Tag a session. Pass null to clear the tag.
 * @param sessionId - UUID of the session
 * @param tag - Tag string, or null to clear
 * @param options - `{ dir?: string }` project path; omit to search all projects
 */
export async function tagSession(
  sessionId: string,
  tag: string | null,
  options?: SessionMutationOptions,
): Promise<void> {
  const { validateUuid, resolveSessionFilePath } = await import('../utils/sessionStoragePortable.js')
  const valid = validateUuid(sessionId)
  if (!valid) throw new TypeError('Invalid session ID')
  if (tag !== null && typeof tag !== 'string') throw new TypeError('Tag must be a string or null')
  const file = await resolveSessionFilePath(valid, options?.dir)
  if (!file) throw new Error('Session not found: ' + sessionId)
  const { saveTag } = await import('../utils/sessionStorage.js')
  // The last tag entry wins. An empty string is the canonical cleared value.
  await saveTag(valid, tag ?? '', file.filePath)
}

/**
 * Fork a session into a new branch with fresh UUIDs.
 *
 * Copies transcript messages from the source session into a new session file,
 * remapping every message UUID and preserving the parentUuid chain. Supports
 * `upToMessageId` for branching from a specific point in the conversation.
 *
 * Forked sessions start without undo history (file-history snapshots are not
 * copied).
 *
 * @param sessionId - UUID of the source session
 * @param options - `{ dir?, upToMessageId?, title? }`
 * @returns `{ sessionId }` — UUID of the new forked session
 */
export async function forkSession(
  sessionId: string,
  options?: ForkSessionOptions,
): Promise<ForkSessionResult> {
  const { validateUuid, resolveSessionFilePath } = await import('../utils/sessionStoragePortable.js')
  const valid = validateUuid(sessionId)
  if (!valid) throw new TypeError('Invalid session ID')
  const file = await resolveSessionFilePath(valid, options?.dir)
  if (!file) throw new Error('Session not found: ' + sessionId)
  const { loadTranscriptFromFile } = await import('../utils/sessionStorage.js')
  const log = await loadTranscriptFromFile(file.filePath)
  if (log.isSidechain || log.messages.length === 0) {
    throw new Error('A sidechain or empty session cannot be forked')
  }
  // loadTranscriptFromFile uses the same parent-link and compact-boundary
  // reconstruction as --resume, including parallel tool-result siblings.
  const until = options?.upToMessageId
    ? log.messages.findIndex(item => item.uuid === options.upToMessageId)
    : log.messages.length - 1
  if (until < 0) throw new Error('Cannot fork: upToMessageId is not in this session')
  if (options?.title !== undefined && (typeof options.title !== 'string' ||
      options.title.length === 0)) throw new TypeError('Fork title must be non-empty')
  const {randomUUID} = await import('node:crypto')
  const {writeFile, unlink} = await import('node:fs/promises')
  const {dirname, join} = await import('node:path')
  const newId = randomUUID()
  const ids = new Map<string,ReturnType<typeof randomUUID>>()
  let last: string | null = null
  const entries = log.messages.slice(0, until + 1).map(entry => {
    const previousId = entry.uuid
    const uuid = randomUUID()
    if (previousId) ids.set(previousId,uuid)
    const next = {...entry, uuid, parentUuid:last, sessionId:newId}
    last = uuid
    return next
  })
  // Rebind tool-result origin IDs to the fork's own assistant messages.
  for (const entry of entries) {
    if ('sourceToolAssistantUUID' in entry &&
        typeof entry.sourceToolAssistantUUID === 'string') {
      entry.sourceToolAssistantUUID = ids.get(entry.sourceToolAssistantUUID)
    }
  }
  const output = entries.map(e=>JSON.stringify(e))
  if (options?.title) output.push(JSON.stringify({
    type:'custom-title',customTitle:options.title,sessionId:newId,
  }))
  const destination = join(dirname(file.filePath), newId + '.jsonl')
  // Exclusive create makes a concurrent fork or random UUID collision fail
  // rather than damaging an existing session. File-history snapshots are
  // intentionally not copied, so rewind cannot cross the fork boundary.
  try {
    await writeFile(destination, output.join('\n')+'\n', {flag:'wx',mode:0o600})
  } catch (error) {
    const e = error as NodeJS.ErrnoException
    if (e.code !== 'EEXIST') {
      try { await unlink(destination) }
      catch (cleanupError) {
        if ((cleanupError as NodeJS.ErrnoException).code !== 'ENOENT') throw cleanupError
      }
    }
    throw error
  }
  return {sessionId:newId}
}

// ============================================================================
// Assistant daemon primitives (internal)
// ============================================================================

/**
 * A scheduled task from `<dir>/.claude/scheduled_tasks.json`.
 * @internal
 */
export type CronTask = {
  id: string
  cron: string
  prompt: string
  createdAt: number
  recurring?: boolean
}

/**
 * Cron scheduler tuning knobs (jitter + expiry). Sourced at runtime from the
 * `tengu_kairos_cron_config` GrowthBook config in CLI sessions; daemon hosts
 * pass this through `watchScheduledTasks({ getJitterConfig })` to get the
 * same tuning.
 * @internal
 */
export type CronJitterConfig = {
  recurringFrac: number
  recurringCapMs: number
  oneShotMaxMs: number
  oneShotFloorMs: number
  oneShotMinuteMod: number
  recurringMaxAgeMs: number
}

/**
 * Event yielded by `watchScheduledTasks()`.
 * @internal
 */
export type ScheduledTaskEvent =
  | { type: 'fire'; task: CronTask }
  | { type: 'missed'; tasks: CronTask[] }

/**
 * Handle returned by `watchScheduledTasks()`.
 * @internal
 */
export type ScheduledTasksHandle = {
  /** Async stream of fire/missed events. Drain with `for await`. */
  events(): AsyncGenerator<ScheduledTaskEvent>
  /**
   * Epoch ms of the soonest scheduled fire across all loaded tasks, or null
   * if nothing is scheduled. Useful for deciding whether to tear down an
   * idle agent subprocess or keep it warm for an imminent fire.
   */
  getNextFireTime(): number | null
}

/**
 * Watch `<dir>/.claude/scheduled_tasks.json` and yield events as tasks fire.
 *
 * Acquires the per-directory scheduler lock (PID-based liveness) so a REPL
 * session in the same dir won't double-fire. Releases the lock and closes
 * the file watcher when the signal aborts.
 *
 * - `fire` — a task whose cron schedule was met. One-shot tasks are already
 *   deleted from the file when this yields; recurring tasks are rescheduled
 *   (or deleted if aged out).
 * - `missed` — one-shot tasks whose window passed while the daemon was down.
 *   Yielded once on initial load; a background delete removes them from the
 *   file shortly after.
 *
 * Intended for daemon architectures that own the scheduler externally and
 * spawn the agent via `query()`; the agent subprocess (`-p` mode) does not
 * run its own scheduler.
 *
 * @internal
 */
export function watchScheduledTasks(opts: {
  dir: string
  signal: AbortSignal
  getJitterConfig?: () => CronJitterConfig
}): ScheduledTasksHandle {
  return watchDaemonScheduledTasks317(opts)
}

/**
 * Format missed one-shot tasks into a prompt that asks the model to confirm
 * with the user (via AskUserQuestion) before executing.
 * @internal
 */
export function buildMissedTaskNotification(missed: CronTask[]): string {
  return formatMissedDaemonTasks317(missed)
}

/**
 * A user message typed on claude.ai, extracted from the bridge WS.
 * @internal
 */
export type InboundPrompt = {
  content: string | unknown[]
  uuid?: string
}

/**
 * Options for connectRemoteControl.
 * @internal
 */
export type ConnectRemoteControlOptions = {
  dir: string
  name?: string
  workerType?: string
  branch?: string
  gitRepoUrl?: string | null
  getAccessToken: () => string | undefined
  baseUrl: string
  orgUUID: string
  model: string
}

/**
 * Handle returned by connectRemoteControl. Write query() yields in,
 * read inbound prompts out. See src/assistant/daemonBridge.ts for full
 * field documentation.
 * @internal
 */
export type RemoteControlHandle = {
  sessionUrl: string
  environmentId: string
  bridgeSessionId: string
  write(msg: SDKMessage): void
  sendResult(): void
  sendControlRequest(req: unknown): void
  sendControlResponse(res: unknown): void
  sendControlCancelRequest(requestId: string): void
  inboundPrompts(): AsyncGenerator<InboundPrompt>
  controlRequests(): AsyncGenerator<unknown>
  permissionResponses(): AsyncGenerator<unknown>
  onStateChange(
    cb: (
      state: 'ready' | 'connected' | 'reconnecting' | 'failed',
      detail?: string,
    ) => void,
  ): void
  teardown(): Promise<void>
}

/**
 * Hold a claude.ai remote-control bridge connection from a daemon process.
 *
 * The daemon owns the WebSocket in the PARENT process — if the agent
 * subprocess (spawned via `query()`) crashes, the daemon respawns it while
 * claude.ai keeps the same session. Contrast with `query.enableRemoteControl`
 * which puts the WS in the CHILD process (dies with the agent).
 *
 * Pipe `query()` yields through `write()` + `sendResult()`. Read
 * `inboundPrompts()` (user typed on claude.ai) into `query()`'s input
 * stream. Handle `controlRequests()` locally (interrupt → abort, set_model
 * → reconfigure).
 *
 * Skips the `tengu_ccr_bridge` gate and policy-limits check — @internal
 * caller is pre-entitled. OAuth is still required (env var or keychain).
 *
 * Returns null on no-OAuth or registration failure.
 *
 * @internal
 */
export async function connectRemoteControl(
  opts: ConnectRemoteControlOptions,
): Promise<RemoteControlHandle | null> {
  // Remote control is opt-in and the expensive bridge is loaded on demand;
  // CLI and SDK now share the same reconnecting v2 transport and credentials.
  const { connectSdkRemoteControl317 } = await import('./sdk/remoteControl317.js')
  return connectSdkRemoteControl317(opts)
}
