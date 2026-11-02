import type { AgentId } from './ids.js'
import type { NormalizedAssistantMessage, NormalizedUserMessage } from './message.js'

/**
 * Each variant is emitted by a real Tool.call/onProgress path (BashTool,
 * PowerShellTool, AgentTool, MCP client, WebSearchTool, SkillTool, TaskOutput).
 * Keeping the discriminant prevents the shell and remote-agent UI from reading
 * another tool's progress payload as if it were its own.
 */
export interface ShellProgressFields {
  output: string
  fullOutput: string
  elapsedTimeSeconds: number
  totalLines: number
  totalBytes: number
  timeoutMs?: number
  taskId?: string
}
export interface BashProgress extends ShellProgressFields {
  type: 'bash_progress'
}
export interface PowerShellProgress extends ShellProgressFields {
  type: 'powershell_progress'
}
export type ShellProgress = BashProgress | PowerShellProgress

export type MCPProgress = {
  type: 'mcp_progress'
  status: 'started' | 'progress' | 'completed' | 'failed'
  serverName: string
  toolName: string
  progress?: number
  total?: number
  progressMessage?: string
  elapsedTimeMs?: number
}

export interface AgentToolProgress {
  type: 'agent_progress'
  message: NormalizedAssistantMessage | NormalizedUserMessage
  prompt: string
  agentId: AgentId
}
export interface SkillToolProgress {
  type: 'skill_progress'
  message: NormalizedAssistantMessage | NormalizedUserMessage
  prompt: string
  agentId: AgentId
}
export interface TaskOutputProgress {
  type: 'waiting_for_task'
  taskDescription: string
  taskType: string
}
export type WebSearchProgress =
  | { type: 'query_update'; query: string }
  | { type: 'search_results_received'; query: string; resultCount: number }

export interface REPLToolProgress {
  type: 'repl_progress'
  output?: string
  elapsedTimeSeconds?: number
}
export interface SdkWorkflowProgress {
  type: 'phase' | 'step' | 'workflow'
  index: number
  phaseIndex?: number
  status?: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  name?: string
  summary?: string
}
export type ToolProgressData =
  | ShellProgress
  | MCPProgress
  | AgentToolProgress
  | SkillToolProgress
  | TaskOutputProgress
  | WebSearchProgress
  | REPLToolProgress
  | SdkWorkflowProgress
