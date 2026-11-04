import { setTimeout as delay } from 'node:timers/promises'

// Port of 2.1.317 chunk-nsyknqzt.js daemon-worker protocol. The heartbeat
// worker is always available. Other kinds require host gates and are refused
// with the original EX_CONFIG code until their respective hosts are connected.
export type DaemonWorkerKind317 = 'heartbeat' | 'scheduled' | 'remoteControl'
export const DAEMON_WORKER_CONFIG_ERROR_317 = 2
export const DAEMON_WORKER_UNAVAILABLE_317 = 78
const KINDS = new Set(['heartbeat', 'scheduled', 'remoteControl'])

type Issue317 = {
  expected?: string; origin?: string; code: string; minimum?: number
  inclusive?: boolean; keys?: string[]; path: string[]; message: string
}
function received(value: unknown): string {
  return value === null ? 'null' : value === undefined ? 'undefined' :
    Array.isArray(value) ? 'array' : typeof value
}
export function validateHeartbeatConfig317(value: unknown):
  { ok: true; intervalSeconds: number } | { ok: false; issues: Issue317[] } {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return { ok: false, issues: [{ expected: 'object', code: 'invalid_type',
      path: [], message: 'Invalid input: expected object, received ' + received(value) }] }
  const config = value as Record<string, unknown>
  const issues: Issue317[] = []
  const interval = config.intervalSeconds === undefined ? 30 : config.intervalSeconds
  if (typeof interval !== 'number' || !Number.isFinite(interval))
    issues.push({ expected: 'number', code: 'invalid_type', path: ['intervalSeconds'],
      message: 'Invalid input: expected number, received ' + received(interval) })
  else if (interval <= 0)
    issues.push({ origin: 'number', code: 'too_small', minimum: 0, inclusive: false,
      path: ['intervalSeconds'], message: 'Too small: expected number to be >0' })
  const keys = Object.keys(config).filter(k => k !== 'intervalSeconds')
  if (keys.length)
    issues.push({ code: 'unrecognized_keys', keys, path: [],
      message: keys.length === 1 ? 'Unrecognized key: "' + keys[0] + '"' :
        'Unrecognized keys: ' + keys.map(k => '"' + k + '"').join(', ') })
  return issues.length ? { ok: false, issues } : { ok: true, intervalSeconds: interval as number }
}

export type ParentWatcherOptions317 = {
  parentPid?: () => number
  isAlive?: (pid: number) => boolean
  onGone?: () => void
  log?: (line: string) => void
  intervalMs?: number
  exitGraceMs?: number
  platform?: NodeJS.Platform
}
export function watchDaemonWorkerParent317(controller: AbortController,
  options: ParentWatcherOptions317 = {}): () => void {
  const parentPid = options.parentPid ?? (() => process.ppid)
  const isAlive = options.isAlive ?? (pid => {
    try { process.kill(pid, 0); return true }
    catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM' }
  })
  const log = options.log ?? (line => process.stdout.write(line + '\n'))
  const onGone = options.onGone ?? (() => process.exit(0))
  const intervalMs = options.intervalMs ?? 30_000
  const exitGraceMs = options.exitGraceMs ?? 2_000
  const platform = options.platform ?? process.platform
  const initial = parentPid()
  if (initial <= 1) return () => {}
  let ending = false
  let exitTimer: ReturnType<typeof setTimeout> | undefined
  const timer = setInterval(() => {
    if (ending || controller.signal.aborted) return
    if (isAlive(initial) && (platform === 'win32' || parentPid() === initial)) return
    ending = true
    clearInterval(timer)
    log('parent supervisor gone — exiting')
    controller.abort()
    exitTimer = setTimeout(onGone, exitGraceMs)
    exitTimer.unref()
  }, intervalMs)
  timer.unref()
  return () => { clearInterval(timer); if (exitTimer) clearTimeout(exitTimer) }
}

export async function runHeartbeatWorker317(
  config: { intervalSeconds: number }, signal: AbortSignal,
  output: (line: string) => void,
): Promise<void> {
  output('heartbeat worker started (interval=' + config.intervalSeconds + 's)')
  while (!signal.aborted) {
    try { await delay(config.intervalSeconds * 1000, undefined, { signal }) }
    catch (error) {
      if (signal.aborted && (error as Error).name === 'AbortError') break
      throw error
    }
    if (!signal.aborted) output('heartbeat')
  }
}
async function readDaemonStdin317(input: AsyncIterable<Uint8Array | string>): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of input)
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}
export type DaemonWorkerOptions317 = {
  input?: AsyncIterable<Uint8Array | string>
  stdout?: (s: string) => void
  stderr?: (s: string) => void
  parent?: NodeJS.Process
  parentWatcher?: typeof watchDaemonWorkerParent317
}
export async function runDaemonWorker317(kind: string | undefined,
  options: DaemonWorkerOptions317 = {}): Promise<number> {
  const stderr = options.stderr ?? (s => process.stderr.write(s))
  const stdout = options.stdout ?? (s => process.stdout.write(s))
  if (!kind || !KINDS.has(kind)) {
    stderr('unknown worker kind: ' + String(kind) + '\n')
    return DAEMON_WORKER_CONFIG_ERROR_317
  }
  if (kind !== 'heartbeat') {
    stderr("worker kind '" + kind + "' is not available.\n")
    return DAEMON_WORKER_UNAVAILABLE_317
  }
  let envelope: unknown
  try { envelope = JSON.parse(await readDaemonStdin317(options.input ?? process.stdin)) }
  catch (error) {
    stderr('invalid config JSON on stdin: ' +
      (error instanceof Error ? error.message : String(error)) + '\n')
    return DAEMON_WORKER_CONFIG_ERROR_317
  }
  const configValue = envelope && typeof envelope === 'object' ?
    (envelope as Record<string, unknown>).config : undefined
  const config = validateHeartbeatConfig317(configValue)
  if (!config.ok) {
    stderr('config validation failed: ' + JSON.stringify(config.issues, null, 2) + '\n')
    return DAEMON_WORKER_CONFIG_ERROR_317
  }
  const controller = new AbortController()
  const parent = options.parent ?? process
  const stop = () => controller.abort()
  const receive = (message: unknown) => {
    if (message && typeof message === 'object' &&
      (message as Record<string, unknown>).type === 'shutdown') stop()
  }
  parent.on('SIGTERM', stop)
  parent.on('SIGINT', stop)
  parent.on('message', receive)
  const stopWatcher = (options.parentWatcher ?? watchDaemonWorkerParent317)(controller)
  try {
    await runHeartbeatWorker317(config, controller.signal, line => stdout(line + '\n'))
    return 0
  } finally {
    stopWatcher()
    parent.off('SIGTERM', stop)
    parent.off('SIGINT', stop)
    parent.off('message', receive)
  }
}
