/** Startup failure framing from 2.1.317 chunk-jqk86hjp/chunk-md5wm0jt. */
import { randomUUID } from 'node:crypto'
import { escapeUnsafeJsonWireCharacters } from '../cli/jsonWireEscaping.ts'
import { getCliFlagValue, isStreamJsonLaunch } from './cliArgv317.ts'

const ALWAYS_RESULT = new Set(['org_config_required_unavailable', 'org_config_refused'])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export type StartupFailureInput317 = {
  sessionId: string
  message: string
  reason?: string
  resultIndex?: number | null
}
export type StartupFramesOptions317 = {
  goesOn?: boolean
  stdout?: typeof process.stdout
  argv?: string[]
}
export type StartupFailureWriteOptions317 = {
  argv?: string[]
  env?: NodeJS.ProcessEnv
  stdout?: typeof process.stdout
}

export function isStartupFailureResultRequested(env: NodeJS.ProcessEnv = process.env): boolean {
  return ['1', 'true', 'yes', 'on'].includes(String(env.CLAUDE_CODE_STARTUP_FAILURE_RESULTS ?? '').toLowerCase().trim())
}
export function startupResultSessionId(fallback: string, argv: string[] = process.argv.slice(2)): string {
  const requested = getCliFlagValue('--session-id', argv)
  return (getCliFlagValue('--sdk-url', argv) === undefined ? (UUID.test(requested ?? '') ? requested : null) : requested) || fallback
}
export function buildStartupFailureResult({ sessionId, message, reason, resultIndex = 0 }: StartupFailureInput317): Record<string, unknown> {
  return {
    type: 'result', subtype: 'error_during_execution', duration_ms: 0, duration_api_ms: 0,
    is_error: true, num_turns: 0, stop_reason: null, session_id: sessionId, total_cost_usd: 0,
    usage: { output_tokens_details: { thinking_tokens: 0 }, input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0, server_tool_use: { web_search_requests: 0, web_fetch_requests: 0 }, service_tier: 'standard', cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 0 }, inference_geo: '', iterations: [], speed: 'standard', fallback_credit: null },
    modelUsage: {}, permission_denials: [], uuid: randomUUID(), errors: [message],
    ...(reason !== undefined ? { startup_failure_reason: reason } : {}),
    ...(resultIndex !== null ? { result_index: resultIndex } : {}),
  }
}
/** A broken output pipe must not hide the original startup failure. */
export async function writeStartupFrames(frames: readonly unknown[], { goesOn = false, stdout = process.stdout, argv = process.argv.slice(2) }: StartupFramesOptions317 = {}): Promise<boolean> {
  if (!isStreamJsonLaunch(argv) || stdout.writableEnded || stdout.destroyed) return false
  let finish: (value: boolean) => void = () => {}
  const flushed = new Promise<boolean>(resolve => { finish = resolve })
  const onError = () => finish(false)
  stdout.once('error', onError)
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    stdout.write(frames.map(frame => escapeUnsafeJsonWireCharacters(JSON.stringify(frame)) + '\n').join(''), error => finish(!error))
    const timeout = new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), 1000) })
    const written = await Promise.race([flushed, timeout])
    if (goesOn && written) stdout.off('error', onError)
    return written
  } catch { return false } finally { clearTimeout(timer) }
}
export async function writeStartupFailureResult(input: StartupFailureInput317, { argv = process.argv.slice(2), env = process.env, stdout = process.stdout }: StartupFailureWriteOptions317 = {}): Promise<boolean> {
  if (!ALWAYS_RESULT.has(input.reason) && !isStartupFailureResultRequested(env)) return false
  return writeStartupFrames([buildStartupFailureResult({ ...input, sessionId: startupResultSessionId(input.sessionId, argv) })], { argv, stdout })
}
export function getStartupCwdError(getCwd: () => unknown = () => process.cwd()): string | undefined {
  try { getCwd(); return undefined } catch (error) {
    const code = error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : undefined
    return code === 'ENOENT'
      ? 'The current directory no longer exists (it was deleted or moved). Start Claude Code from an existing directory.'
      : `Can't read the current directory${code ? ` (${code})` : ''}. Start Claude Code from a different directory.`
  }
}
export async function reportCliStartupFailure(error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error)
  process.exitCode = 1
  process.stderr.write(`Error: ${message}\n`)
  await writeStartupFailureResult({ sessionId: randomUUID(), message })
}
