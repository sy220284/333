import type { UUID } from 'node:crypto'
import type {
  BetaContentBlock,
  BetaMessage,
  BetaRawMessageStreamEvent,
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import type { APIError } from '@anthropic-ai/sdk'
import type { Progress } from '../Tool.js'
import type { Attachment } from '../utils/attachments.js'
import type { PermissionMode } from './permissions.js'
import type { SDKAssistantMessageError } from '../entrypoints/agentSdkTypes.js'

/**
 * The runtime message protocol is reconstructed from the actual constructors
 * in utils/messages.ts and utils/attachments.ts, not from the erased .map
 * sources. All variants retain a discriminant for safe narrowing.
 */
export interface MessageHeader {
  uuid: UUID
  timestamp: string
}
export type MessageOrigin =
  | { kind: 'human' }
  | { kind: 'coordinator' }
  | { kind: 'task-notification' }
  | { kind: 'channel'; server: string }

export type PartialCompactDirection = 'from' | 'to' | 'up_to'
export type SystemMessageLevel = 'info' | 'warning' | 'error' | 'suggestion' | 'success'
export interface StopHookInfo {
  command: string
  promptText?: string
  /** Real wall-clock duration of this hook, in milliseconds. */
  durationMs?: number
}
export interface UserMessage extends MessageHeader {
  type: 'user'
  message: { role: 'user'; content: string | ContentBlockParam[] }
  isMeta?: true
  isVisibleInTranscriptOnly?: true
  isVirtual?: true
  isCompactSummary?: true
  summarizeMetadata?: {
    messagesSummarized: number
    userContext?: string
    direction?: PartialCompactDirection
  }
  toolUseResult?: unknown
  mcpMeta?: {
    _meta?: Record<string, unknown>
    structuredContent?: Record<string, unknown>
  }
  imagePasteIds?: number[]
  sourceToolAssistantUUID?: UUID
  /** Tool-result messages may be linked directly to their originating tool use. */
  sourceToolUseID?: string
  /** Plan-mode exit carries the plan to the next session when clearing context. */
  planContent?: string
  permissionMode?: PermissionMode
  origin?: MessageOrigin
}
export interface AssistantMessage extends MessageHeader {
  type: 'assistant'
  message: BetaMessage & { context_management?: unknown }
  isMeta?: boolean
  isVirtual?: true
  requestId?: string
  apiError?: string
  error?: SDKAssistantMessageError
  errorDetails?: string
  isApiErrorMessage?: boolean
  advisorModel?: string
  parent_tool_use_id?: string | null
}
export interface AttachmentMessage<T extends Attachment = Attachment> extends MessageHeader {
  type: 'attachment'
  attachment: T
}
export interface ProgressMessage<P extends Progress = Progress> extends MessageHeader {
  type: 'progress'
  data: P
  toolUseID: string
  parentToolUseID: string
}
interface BaseSystemMessage extends MessageHeader {
  type: 'system'
  subtype: string
  isMeta?: false
  content?: string
}
export interface SystemInformationalMessage extends BaseSystemMessage {
  subtype: 'informational'
  content: string
  level: SystemMessageLevel
  toolUseID?: string
  preventContinuation?: boolean
}
export interface SystemPermissionRetryMessage extends BaseSystemMessage {
  subtype: 'permission_retry'
  content: string
  commands: string[]
  level: 'info'
}
export interface SystemBridgeStatusMessage extends BaseSystemMessage {
  subtype: 'bridge_status'
  content: string
  url: string
  upgradeNudge?: string
}
export interface SystemScheduledTaskFireMessage extends BaseSystemMessage {
  subtype: 'scheduled_task_fire'
  content: string
}
export interface SystemStopHookSummaryMessage extends BaseSystemMessage {
  subtype: 'stop_hook_summary'
  hookCount: number
  hookInfos: StopHookInfo[]
  hookErrors: string[]
  preventedContinuation: boolean
  stopReason?: string
  hasOutput: boolean
  level: SystemMessageLevel
  toolUseID?: string
  hookLabel?: string
  totalDurationMs?: number
}
export interface SystemTurnDurationMessage extends BaseSystemMessage {
  subtype: 'turn_duration'
  durationMs: number
  budgetTokens?: number
  budgetLimit?: number
  budgetNudges?: number
  messageCount?: number
}
export interface SystemAwaySummaryMessage extends BaseSystemMessage {
  subtype: 'away_summary'
  content: string
}
export interface SystemMemorySavedMessage extends BaseSystemMessage {
  subtype: 'memory_saved'
  writtenPaths: string[]
  /** Optional team-memory count for the dedicated memory-saved UI. */
  teamCount?: number
  /** Automated dream memory edits use a distinct user-facing action. */
  verb?: string
}

export type CompactMetadata =
  SystemCompactBoundaryMessage['compactMetadata']

/** A remote session preserves a real plan snapshot in its transcript. */
export interface SystemFileSnapshotMessage
  extends Omit<BaseSystemMessage, 'isMeta'> {
  subtype: 'file_snapshot'
  content: string
  level: 'info'
  isMeta: true
  snapshotFiles: Array<{ key: string; path: string; content: string }>
}
export interface SystemAgentsKilledMessage extends BaseSystemMessage {
  subtype: 'agents_killed'
}
export interface SystemApiMetricsMessage extends BaseSystemMessage {
  subtype: 'api_metrics'
  ttftMs: number
  otps: number
  isP50?: boolean
  hookDurationMs?: number
  turnDurationMs?: number
  toolDurationMs?: number
  classifierDurationMs?: number
  toolCount?: number
  hookCount?: number
  classifierCount?: number
  configWriteCount?: number
}
export interface SystemLocalCommandMessage extends BaseSystemMessage {
  subtype: 'local_command'
  content: string
  level: 'info'
}
export interface SystemCompactBoundaryMessage extends BaseSystemMessage {
  subtype: 'compact_boundary'
  content: string
  level: 'info'
  compactMetadata: {
    trigger: 'manual' | 'auto'
    preTokens: number
    userContext?: string
    messagesSummarized?: number
    /** Preserved session tail remains linked after compact boundary. */
    preservedSegment?: {
      headUuid: UUID
      anchorUuid: UUID
      tailUuid: UUID
    }
    /** Deferred tools available before compacting the turn. */
    preCompactDiscoveredTools?: string[]
  }
  logicalParentUuid?: UUID
}
export interface SystemMicrocompactBoundaryMessage extends BaseSystemMessage {
  subtype: 'microcompact_boundary'
  content: string
  level: 'info'
  microcompactMetadata: {
    trigger: 'auto'
    preTokens: number
    tokensSaved: number
    compactedToolIds: string[]
    clearedAttachmentUUIDs: string[]
  }
}
export interface SystemAPIErrorMessage extends BaseSystemMessage {
  subtype: 'api_error'
  level: 'error'
  cause?: Error
  error: APIError
  retryInMs: number
  retryAttempt: number
  maxRetries: number
}
export type SystemMessage =
  | SystemInformationalMessage
  | SystemPermissionRetryMessage
  | SystemBridgeStatusMessage
  | SystemScheduledTaskFireMessage
  | SystemStopHookSummaryMessage
  | SystemTurnDurationMessage
  | SystemAwaySummaryMessage
  | SystemMemorySavedMessage
  | SystemFileSnapshotMessage
  | SystemAgentsKilledMessage
  | SystemApiMetricsMessage
  | SystemLocalCommandMessage
  | SystemCompactBoundaryMessage
  | SystemMicrocompactBoundaryMessage
  | SystemAPIErrorMessage

export type Message =
  | UserMessage
  | AssistantMessage
  | AttachmentMessage
  | ProgressMessage
  | SystemMessage

export type HookResultMessage = UserMessage | AttachmentMessage | ProgressMessage | SystemMessage
export interface RequestStartEvent {
  type: 'stream_request_start'
}
export interface StreamEvent {
  type: 'stream_event'
  event: BetaRawMessageStreamEvent
  requestId?: string
  ttftMs?: number
  apiMessageId?: string
  thinkingDisplay?: string
  abandonedBlocks?: { apiMessageId: string; fromBlockIndex: number }
  textRunsJoined?: boolean
}
export interface TombstoneMessage {
  type: 'tombstone'
  message: Message
}
export interface ToolUseSummaryMessage extends MessageHeader {
  type: 'tool_use_summary'
  summary: string
  precedingToolUseIds: string[]
}
export type NormalizedAssistantMessage<Block extends BetaContentBlock = BetaContentBlock> =
  Omit<AssistantMessage, 'message'> & {
    message: AssistantMessage['message'] & { content: [Block] }
  }
export type NormalizedUserMessage<Block extends ContentBlockParam = ContentBlockParam> =
  Omit<UserMessage, 'message'> & {
    message: UserMessage['message'] & { content: [Block] }
  }
export type NormalizedMessage =
  | NormalizedAssistantMessage
  | NormalizedUserMessage
  | AttachmentMessage
  | ProgressMessage
  | SystemMessage
export interface GroupedToolUseMessage extends MessageHeader {
  type: 'grouped_tool_use'
  toolName: string
  messages: NormalizedAssistantMessage[]
  results: NormalizedUserMessage[]
  displayMessage: NormalizedAssistantMessage
  messageId: string
}
export type CollapsibleMessage = NormalizedAssistantMessage | NormalizedUserMessage | GroupedToolUseMessage | SystemStopHookSummaryMessage | AttachmentMessage
export interface CollapsedReadSearchGroup extends MessageHeader {
  type: 'collapsed_read_search'
  searchCount: number
  readCount: number
  listCount: number
  replCount: number
  memorySearchCount: number
  memoryReadCount: number
  memoryWriteCount: number
  readFilePaths: string[]
  searchArgs: string[]
  latestDisplayHint?: string
  messages: CollapsibleMessage[]
  displayMessage: CollapsibleMessage
  teamMemorySearchCount?: number
  teamMemoryReadCount?: number
  teamMemoryWriteCount?: number
  mcpCallCount?: number
  mcpServerNames?: string[]
  bashCount?: number
  gitOpBashCount?: number
  commits?: { sha: string; kind: import('../tools/shared/gitOperationTracking.js').CommitKind }[]
  pushes?: { branch: string }[]
  branches?: { ref: string; action: import('../tools/shared/gitOperationTracking.js').BranchAction }[]
  prs?: { number: number; url?: string; action: import('../tools/shared/gitOperationTracking.js').PrAction }[]
  hookTotalMs?: number
  hookCount?: number
  hookInfos?: StopHookInfo[]
  relevantMemories?: { path: string; content: string; mtimeMs: number }[]
}
export type RenderableMessage = NormalizedMessage | GroupedToolUseMessage | CollapsedReadSearchGroup
export interface SystemThinkingMessage extends MessageHeader {
  type: 'thinking'
  content: string
}
