export function remoteSessionUuid(value: string | undefined): string | null
export function shouldIsolateChildSession(
  env?: NodeJS.ProcessEnv,
  argv?: string[],
): boolean
export function resolveInitialSessionId(
  env?: NodeJS.ProcessEnv,
  argv?: string[],
  generateId?: () => string,
): string
