/**
 * Caller-defined exact task command scope. This is enforced independently of
 * permissions, classifiers, and the model's natural-language interpretation.
 */
const FILE_OPERATIONS = new Set([
  'Read', 'Grep', 'Glob', 'Edit', 'Write',
  'FileRead', 'FileEdit', 'FileWrite', 'TodoWrite', 'TaskOutput', 'TaskGet',
])
export function getStrictCommandScopeError(
  toolName: string,
  input: unknown,
  configured: string | undefined = process.env.YAOYAOCHE_STRICT_COMMAND,
): string | undefined {
  if (configured === undefined) return undefined
  if (!configured.trim()) return '严格命令范围为空，工具执行已拒绝'
  if (toolName === 'Bash') {
    const command = input && typeof input === 'object' && 'command' in input
      ? (input as { command: unknown }).command : undefined
    if (typeof command === 'string' && command.trim() === configured.trim()) return undefined
    return '严格命令范围拒绝：仅允许执行授权的完整 Bash 命令'
  }
  if (FILE_OPERATIONS.has(toolName)) return undefined
  return `严格命令范围拒绝：${toolName} 未授权；仅允许文件操作与指定的 Bash 命令`
}
