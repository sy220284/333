import type { z } from 'zod/v4'

/**
 * Validate external MCP arguments against the tool's real input schema
 * before tool-specific checks and side effects are allowed to run.
 */
export function parseMcpToolArguments<T>(
  toolName: string,
  schema: z.ZodType<T>,
  argumentsFromClient: unknown,
): T {
  const result = schema.safeParse(argumentsFromClient ?? {})
  if (!result.success) {
    const errors = result.error.issues.map(issue =>
      `${issue.path.join('.') || '(root)'}: ${issue.message}`,
    ).join('; ')
    throw new Error(`Tool ${toolName} input is invalid: ${errors}`)
  }
  return result.data
}
