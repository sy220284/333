/**
 * SDK runtime contracts that cannot be expressed by the serializable Zod
 * schemas in coreSchemas.ts: callbacks, MCP instances, async streams and
 * session methods.
 *
 * Source of truth for serializable request/result payloads remains
 * coreTypes.generated.ts. Do not duplicate those payload structures here.
 * This is a type-only module: the actual SDK runtime still needs a separate
 * executable implementation.
 */
import type { CallToolResult, ToolAnnotations, McpServer } from "@modelcontextprotocol/server";
import type { z } from 'zod/v4'
import type {
  AgentDefinition,
  HookEvent,
  McpServerConfigForProcessTransport,
  PermissionMode,
  PermissionResult,
  PermissionUpdate,
  SDKMessage,
  SDKResultMessage,
  SDKSessionInfo,
  SDKUserMessage,
  SettingSource,
  SdkPluginConfig,
  ThinkingConfig,
} from './coreTypes.js'
import type { SDKHookCallbackMatcher, SDKHookCallbackRequest, SDKHostControlRequest } from './controlTypes.js'

/** Exactly the Zod object shape accepted by the SDK tool() factory. */
export type AnyZodRawShape = Record<string, z.ZodType>
export type InferShape<Schema extends AnyZodRawShape> =
  z.infer<z.ZodObject<Schema>>

export type SdkMcpToolDefinition<Schema extends AnyZodRawShape> = {
  name: string
  description: string
  inputSchema: Schema
  handler: (
    args: InferShape<Schema>,
    extra: unknown,
  ) => Promise<CallToolResult>
  annotations?: ToolAnnotations
  searchHint?: string
  alwaysLoad?: boolean
}

/**
 * The MCP SDK transport takes a *live* server. Its instance is intentionally
 * kept separate from the serializable 'sdk' entry in MCP status responses.
 */
export type McpSdkServerConfigWithInstance = {
  type: 'sdk'
  name: string
  instance: McpServer
}
export type McpServerConfig =
  | McpServerConfigForProcessTransport
  | McpSdkServerConfigWithInstance

export type SDKPermissionContext = {
  signal: AbortSignal
  suggestions?: PermissionUpdate[]
  toolUseID?: string
  requestId?: string
  blockedPath?: string
  mcpServer?: { name: string; source: string }
  decisionReason?: string
  decisionReasonType?: string
  decisionReasonCode?: string
  serverPolicyAskOnly?: boolean
  title?: string
  displayName?: string
  description?: string
  defaultToNo?: boolean
  suppressAlwaysAllowRule?: boolean
  agentID?: string
  plugin?: string
  requiresUserInteraction?: boolean
  serverPrompt?: string
  computerFolder?: { path: string; computer_name: string }
  matchedAskRule?: { source: string; toolName: string; ruleContent?: unknown }
}

export type CanUseTool = (
  toolName: string,
  input: Record<string, unknown>,
  options: SDKPermissionContext,
) => Promise<PermissionResult>

export type HostControlRequestHandler = (
  request: SDKHostControlRequest,
  options: { signal: AbortSignal; requestId: string },
) => Promise<Record<string, unknown>>

export type HookCallback = (
  input: SDKHookCallbackRequest['input'],
  toolUseID: string | undefined,
  options: { signal: AbortSignal },
) => Promise<Record<string, unknown>>

export type HookCallbacks = Partial<Record<HookEvent, Array<
  Omit<SDKHookCallbackMatcher, 'hookCallbackIds'> & { hooks: HookCallback[] }
>>>

export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export type SessionStoreKey = { projectKey: string; sessionId: string; subpath?: string }
export type SessionStore = {
  append(key: SessionStoreKey, entries: Record<string, unknown>[]): Promise<void>
  load(key: SessionStoreKey): Promise<Record<string, unknown>[] | null | undefined>
  listSessions(projectKey: string): Promise<Array<{ sessionId: string; mtime: number }>>
  listSubkeys?(key: SessionStoreKey): Promise<string[]>
}

export type Options = {
  sessionStore?: SessionStore
  loadTimeoutMs?: number
  abortController?: AbortController
  model?: string
  fallbackModel?: string
  effort?: EffortLevel
  cwd?: string
  pathToClaudeCodeExecutable?: string
  executable?: 'node' | 'bun'
  executableArgs?: string[]
  env?: Record<string, string | undefined>
  tools?: string[] | { type: 'preset'; preset: 'claude_code' }
  allowedTools?: string[]
  disallowedTools?: string[]
  permissionMode?: PermissionMode
  allowDangerouslySkipPermissions?: boolean
  permissionPromptToolName?: string
  canUseTool?: CanUseTool
  onControlRequest?: HostControlRequestHandler
  hooks?: HookCallbacks
  mcpServers?: Record<string, McpServerConfig>
  agents?: Record<string, AgentDefinition>
  plugins?: SdkPluginConfig[]
  systemPrompt?: string | {
    type: 'preset'
    preset: 'claude_code'
    append?: string
    excludeDynamicSections?: boolean
  }
  appendSystemPrompt?: string
  settingSources?: SettingSource[]
  settings?: string
  strictMcpConfig?: boolean
  thinking?: ThinkingConfig
  maxThinkingTokens?: number
  maxTurns?: number
  maxBudgetUsd?: number
  continue?: boolean
  resume?: string
  forkSession?: boolean
  resumeSessionAt?: string
  includePartialMessages?: boolean
  replayUserMessages?: boolean
  outputFormat?: { type: 'json_schema'; schema: Record<string, unknown> }
  additionalDirectories?: string[]
  noSessionPersistence?: boolean
  debug?: boolean
  debugFile?: string
  stderr?: (data: string) => void
}

export type InternalOptions = Options & {
  /** Internal transport/session callers can opt into extra event streams. */
  includeHookEvents?: boolean
  forwardSubagentText?: boolean
  enableAuthStatus?: boolean
  /** The CLI is responsible for authenticating/handling this locally. */
  clientDataUrl?: string
}

/**
 * The SDK query object is an async iterator plus a duplex control surface.
 * Methods use the same payload types as the control protocol.
 */
export interface Query extends AsyncGenerator<SDKMessage, void, unknown> {
  interrupt(): Promise<void>
  setPermissionMode(mode: PermissionMode): Promise<void>
  setModel(model?: string): Promise<void>
  setMaxThinkingTokens(tokens: number | null): Promise<void>
  supportedCommands(): Promise<ReadonlyArray<{ name: string; description: string; argumentHint?: string }>>
  supportedModels(): Promise<ReadonlyArray<{ value: string; displayName: string; description: string }>>
  mcpServerStatus(): Promise<ReadonlyArray<{ name: string; status: string }>>
  mcpReconnect(serverName: string): Promise<void>
  mcpToggle(serverName: string, enabled: boolean): Promise<void>
  rewindFiles(userMessageId: string): Promise<{ canRewind: boolean; error?: string }>
}

export interface InternalQuery extends Query {
  /** Internal SDK integrations may expose the transport initialization. */
  initializationResult(): Promise<Record<string, unknown>>
}

export type SDKSessionOptions = {
  sessionStore?: SessionStore
  loadTimeoutMs?: number
  abortController?: AbortController
  model: string
  pathToClaudeCodeExecutable?: string
  executable?: 'node' | 'bun'
  executableArgs?: string[]
  env?: Record<string, string | undefined>
  allowedTools?: string[]
  disallowedTools?: string[]
  canUseTool?: CanUseTool
  onControlRequest?: HostControlRequestHandler
  hooks?: HookCallbacks
  permissionMode?: PermissionMode
  cwd?: string
  settingSources?: SettingSource[]
}

export interface SDKSession {
  readonly sessionId: string
  send(message: string | SDKUserMessage): Promise<void>
  stream(): AsyncGenerator<SDKMessage, void, unknown>
  close(): void
  /** Wait for CLI process exit, stdio close, MCP teardown and session-store cleanup. */
  closeAndWait(): Promise<void>
}

export type GetSessionMessagesOptions = {
  dir?: string
  limit?: number
  offset?: number
  includeSystemMessages?: boolean
}

/** Serializable transcript messages, constrained to SDK message variants. */
export type SessionMessage = Extract<
  SDKMessage,
  { type: 'user' | 'assistant' | 'system' }
>

export type ListSessionsOptions = {
  dir?: string
  limit?: number
  offset?: number
}
export type GetSessionInfoOptions = { dir?: string }
export type SessionMutationOptions = { dir?: string }
export type ForkSessionOptions = {
  dir?: string
  upToMessageId?: string
  title?: string
}
export type ForkSessionResult = { sessionId: string }

/** Keep the canonical session info and message types tied to coreSchemas.ts. */
export type { SDKSessionInfo, SDKResultMessage }
