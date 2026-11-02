/**
 * Public tool input/output contracts inferred from the same Zod schemas and
 * ToolDef implementations used by the Claude Code runtime.
 *
 * This replaces a stale separately maintained SDK declaration table. Adding a
 * tool requires adding one key here, but its field types are never copied.
 * The actual ToolSearch/permission gate decides which tools are enabled.
 */
import type { z } from 'zod/v4'
import type { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'

type RuntimeTool = {
  readonly inputSchema: z.ZodType
  mapToolResultToToolResultBlockParam(
    content: never,
    toolUseID: string,
  ): ToolResultBlockParam
}
type InputOf<T extends { readonly inputSchema: z.ZodType }> =
  z.input<T['inputSchema']>
type OutputOf<T> =
  T extends {
    mapToolResultToToolResultBlockParam(
      content: infer Output,
      toolUseID: string,
    ): ToolResultBlockParam
  } ? Output : never

type ToolsByName = {
  Bash: typeof import('../../tools/BashTool/BashTool.js').BashTool
  Read: typeof import('../../tools/FileReadTool/FileReadTool.js').FileReadTool
  Edit: typeof import('../../tools/FileEditTool/FileEditTool.js').FileEditTool
  Write: typeof import('../../tools/FileWriteTool/FileWriteTool.js').FileWriteTool
  Glob: typeof import('../../tools/GlobTool/GlobTool.js').GlobTool
  Grep: typeof import('../../tools/GrepTool/GrepTool.js').GrepTool
  Agent: typeof import('../../tools/AgentTool/AgentTool.js').AgentTool
  Skill: typeof import('../../tools/SkillTool/SkillTool.js').SkillTool
  WebFetch: typeof import('../../tools/WebFetchTool/WebFetchTool.js').WebFetchTool
  WebSearch: typeof import('../../tools/WebSearchTool/WebSearchTool.js').WebSearchTool
  ToolSearch: typeof import('../../tools/ToolSearchTool/ToolSearchTool.js').ToolSearchTool
  AskUserQuestion: typeof import('../../tools/AskUserQuestionTool/AskUserQuestionTool.js').AskUserQuestionTool
  EnterPlanMode: typeof import('../../tools/EnterPlanModeTool/EnterPlanModeTool.js').EnterPlanModeTool
  TaskCreate: typeof import('../../tools/TaskCreateTool/TaskCreateTool.js').TaskCreateTool
  TaskGet: typeof import('../../tools/TaskGetTool/TaskGetTool.js').TaskGetTool
  TaskUpdate: typeof import('../../tools/TaskUpdateTool/TaskUpdateTool.js').TaskUpdateTool
  TaskList: typeof import('../../tools/TaskListTool/TaskListTool.js').TaskListTool
}

/** Input payloads validated by their real tool inputSchema. */
export type ToolInputSchemas = {
  [Name in keyof ToolsByName]: InputOf<ToolsByName[Name]>
}

/** Results are inferred from the tool's actual result-to-block mapper. */
export type ToolOutputSchemas = {
  [Name in keyof ToolsByName]: OutputOf<ToolsByName[Name]>
}

export type ToolName = keyof ToolsByName
export type ToolInput = ToolInputSchemas[ToolName]
export type ToolOutput = ToolOutputSchemas[ToolName]

/** Correlated name/input pair; narrowing name narrows input. */
export type ToolInvocation = {
  [Name in ToolName]: { toolName: Name; input: ToolInputSchemas[Name] }
}[ToolName]
