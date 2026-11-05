export type ClaudeApiContent = { SKILL_PROMPT: string; SKILL_MODEL_VARS: Record<string, string>; SKILL_FILES: Record<string, string> }
export function claudeApiSubcommand(args: string): string
export function processClaudeApiContent(source: string, content: ClaudeApiContent): string
export function buildClaudeApiPrompt(language: string | null, args: string, content: ClaudeApiContent, onDisk: boolean, secureAvailable: boolean, extraSection?: string | null): string
