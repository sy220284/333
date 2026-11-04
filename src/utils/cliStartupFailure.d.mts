export type StartupFailureInput = { sessionId: string; message: string; reason?: string; resultIndex?: number | null }
export function isStartupFailureResultRequested(env?: NodeJS.ProcessEnv): boolean
export function startupResultSessionId(fallback: string, argv?: readonly string[]): string
export function buildStartupFailureResult(input: StartupFailureInput): Record<string, unknown>
export function writeStartupFrames(frames: readonly unknown[], options?: { goesOn?: boolean; stdout?: NodeJS.WriteStream; argv?: readonly string[] }): Promise<boolean>
export function writeStartupFailureResult(input: StartupFailureInput, options?: { stdout?: NodeJS.WriteStream; argv?: readonly string[]; env?: NodeJS.ProcessEnv }): Promise<boolean>
export function getStartupCwdError(getCwd?: () => string): string | undefined
export function reportCliStartupFailure(error: unknown): Promise<void>
