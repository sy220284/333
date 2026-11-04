import { randomUUID, createHash } from 'node:crypto'
import { open, readFile, rename, readdir, mkdir, unlink } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import { homedir, tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

export const SHORT_ID_PATTERN = /^[a-f0-9]{1,8}$/
export const MAX_LOG_BYTES = 1024 * 1024
export const TERMINAL_STATES = new Set(['stopped', 'completed', 'failed', 'removed'])
const TERMINAL_FIELDS = ['sessionId', 'id', 'cwd', 'createdAt', 'updatedAt', 'state', 'argv', 'logPath']
const queue = new Map<string, Promise<unknown>>()

/** The on-disk session identity and lifecycle contract shared by the CLI and supervisor. */
export interface BackgroundRecord317 {
  id: string
  sessionId: string
  cwd: string
  argv: string[]
  logPath: string
  createdAt: string
  updatedAt: string
  state: string
  name?: string | null
  nameSource?: string
  agent?: string | null
  model?: string | null
  pid?: number | null
  exitCode?: number | null
  signalCode?: number | NodeJS.Signals | null
  worktreePath?: string | null
  detail?: string
  startedAt?: number
  respawnCount?: number
  cols?: number
  rows?: number
}
export interface BackgroundView317 extends BackgroundRecord317 { running: boolean }
export type BackgroundRmOptions317 = {
  discardUnpushed?: { headSha: string; worktreeDigest: string }
  forceRemoveWorktree?: string
}

export function fleetHome(env: NodeJS.ProcessEnv = process.env): string {
  const root = env.CLAUDE_CONFIG_DIR || join(env.HOME || homedir(), '.claude')
  return join(resolve(root), 'background')
}
export function fleetSocket(env: NodeJS.ProcessEnv = process.env): string {
  const root = resolve(env.CLAUDE_CONFIG_DIR || join(env.HOME || homedir(), '.claude'))
  const digest = createHash('sha256').update(root).digest('hex').slice(0, 12)
  if (process.platform === 'win32') return `\\\\.\\pipe\\claude-bg-${digest}`
  const uid = typeof process.getuid === 'function' ? process.getuid() : 'user'
  return join(tmpdir(), `cc-daemon-${uid}`, digest, 'control.sock')
}
export function sessionPath(id: string, env: NodeJS.ProcessEnv = process.env): string {
  if (!/^[a-f0-9]{8}$/.test(id)) throw new Error('Invalid background session id')
  return join(fleetHome(env), 'jobs', `${id}.json`)
}
export function isAlive(pid: number | null | undefined): boolean {
  if (typeof pid !== 'number' || !Number.isSafeInteger(pid) || pid < 1) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (error.code === 'ESRCH') return false
    if (error.code === 'EPERM') return true
    throw error
  }
}
function assertRecord(record: unknown): BackgroundRecord317 {
  if (!record || typeof record !== 'object' || Array.isArray(record))
    throw new Error('Invalid session record')
  const data = record as Record<string, unknown>
  for (const field of TERMINAL_FIELDS)
    if (data[field] === undefined) throw new Error(`Missing session field: ${field}`)
  if (typeof data.id !== 'string' || !/^[a-f0-9]{8}$/.test(data.id) ||
      typeof data.sessionId !== 'string' || !Array.isArray(data.argv) ||
      !data.argv.every(a => typeof a === 'string') ||
      typeof data.cwd !== 'string' || typeof data.logPath !== 'string' ||
      typeof data.createdAt !== 'string' || typeof data.updatedAt !== 'string' ||
      typeof data.state !== 'string')
    throw new Error('Invalid background session record')
  return record as BackgroundRecord317
}
export type CreateSessionOptions317 = {
  sessionId?: string
  id?: string
  argv: string[]
  cwd: string
  name?: string | null
  agent?: string | null
  model?: string | null
  env?: NodeJS.ProcessEnv
}
export function createSessionRecord({ sessionId = randomUUID(), id = sessionId.slice(0, 8), argv, cwd, name, agent, model, env = process.env }: CreateSessionOptions317): BackgroundRecord317 {
  const now = new Date().toISOString()
  return assertRecord({
    id, sessionId, argv: [...argv], cwd: resolve(cwd), name: name || null,
    agent: agent || null, model: model || null,
    logPath: join(fleetHome(env), 'logs', `${id}.log`),
    kind: 'background', state: 'starting', detail: '', createdAt: now, updatedAt: now, pid: null,
    exitCode: null, worktreePath: null, startedAt: Date.now(),
  })
}
export async function prepareFleet(env: NodeJS.ProcessEnv = process.env): Promise<string> {
  const root = fleetHome(env)
  await mkdir(join(root, 'jobs'), { recursive: true, mode: 0o700 })
  await mkdir(join(root, 'logs'), { recursive: true, mode: 0o700 })
  if (process.platform !== 'win32') await mkdir(dirname(fleetSocket(env)), { recursive: true, mode: 0o700 })
  return root
}
export async function readSession(id: string, env: NodeJS.ProcessEnv = process.env): Promise<BackgroundRecord317 | null> {
  try { return assertRecord(JSON.parse(await readFile(sessionPath(id, env), 'utf8'))) }
  catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}
async function serialized<T>(id: string, work: () => Promise<T>): Promise<T> {
  const previous = queue.get(id) || Promise.resolve()
  const next = previous.catch(() => {}).then(work)
  queue.set(id, next)
  try { return await next }
  finally { if (queue.get(id) === next) queue.delete(id) }
}
// Reserve a new short ID atomically. A daemon restart or two concurrent
// dispatches must never overwrite an existing conversation with the same
// eight-hex-digit prefix. Existing records are updated via saveSession.
export async function reserveNewSession(record: BackgroundRecord317, env: NodeJS.ProcessEnv = process.env): Promise<BackgroundRecord317> {
  assertRecord(record)
  await prepareFleet(env)
  return serialized(record.id, async () => {
    const path = sessionPath(record.id, env)
    const handle = await open(path, 'wx', 0o600)
    try {
      await handle.writeFile(`${JSON.stringify(record, null, 2)}\n`)
      await handle.sync()
    } catch (error) {
      await handle.close()
      await unlink(path)
      throw error
    }
    await handle.close()
    return record
  })
}

export async function saveSession(record: BackgroundRecord317, env: NodeJS.ProcessEnv = process.env): Promise<BackgroundRecord317> {
  assertRecord(record)
  await prepareFleet(env)
  return serialized(record.id, async () => {
    const dest = sessionPath(record.id, env)
    const temp = `${dest}.${process.pid}.${randomUUID()}.tmp`
    const handle = await open(temp, 'wx', 0o600)
    try {
      await handle.writeFile(`${JSON.stringify(record, null, 2)}\n`)
      await handle.sync()
    } finally { await handle.close() }
    try { await rename(temp, dest) }
    catch (error) { await unlink(temp); throw error }
    return record
  })
}
export async function editSession(id: string, patch: Partial<BackgroundRecord317>, env: NodeJS.ProcessEnv = process.env): Promise<BackgroundRecord317 | null> {
  return serialized(id, async () => {
    const current = await readSession(id, env)
    if (!current) return null
    const updated = assertRecord({ ...current, ...patch, id, updatedAt: new Date().toISOString() })
    const dest = sessionPath(id, env)
    const tmp = `${dest}.${randomUUID()}.tmp`
    const handle = await open(tmp, 'wx', 0o600)
    try { await handle.writeFile(`${JSON.stringify(updated, null, 2)}\n`); await handle.sync() }
    finally { await handle.close() }
    try { await rename(tmp, dest) }
    catch (error) { await unlink(tmp); throw error }
    return updated
  })
}
export async function deleteSession(id: string, env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  // The same session must not be deleted while an edit or reservation is
  // writing its record. The supervisor remains the cross-process owner.
  return serialized(id, async () => {
    const file = sessionPath(id, env)
    try { await unlink(file); return true }
    catch (error) { if (error.code === 'ENOENT') return false; throw error }
  })
}
export async function listSessions({ all = false, cwd, env = process.env }: {
  all?: boolean; cwd?: string; env?: NodeJS.ProcessEnv
} = {}): Promise<BackgroundView317[]> {
  const root = join(fleetHome(env), 'jobs')
  let names
  try { names = await readdir(root) }
  catch (error) { if (error.code === 'ENOENT') return []; throw error }
  const jobs: BackgroundView317[] = []
  for (const name of names.sort()) {
    if (!/^[a-f0-9]{8}\.json$/.test(name)) continue
    const job = await readSession(name.slice(0, 8), env)
    if (!job) continue
    const running = !TERMINAL_STATES.has(job.state) && isAlive(job.pid)
    const state = !running && !TERMINAL_STATES.has(job.state) ? 'stopped' : job.state
    if (!all && TERMINAL_STATES.has(state)) continue
    if (cwd && resolve(job.cwd) !== resolve(cwd)) continue
    jobs.push({ ...job, state, running })
  }
  return jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
// A restarted supervisor must not accidentally resume or delete a PTY
// owned by a still-running worker from its predecessor. The native target
// restores such workers via a persistent rendezvous protocol; until a worker
// can be contacted, preserve its session record and transcript unchanged.
export function assertNoUnmanagedLiveWorker(record: BackgroundRecord317, managedIds: ReadonlySet<string> = new Set<string>()): void {
  if (!managedIds.has(record.id) && isAlive(record.pid)) {
    throw new Error(`Background session ${record.id} still has a live worker (pid ${record.pid}) owned by another supervisor. Keep its session data and reconnect to its owning service before modifying it.`)
  }
}

export function matchSession<T extends BackgroundRecord317>(jobs: T[], query: string,
  { usage = 'id', name = true }: { usage?: string; name?: boolean } = {}): T {
  if (!query || typeof query !== 'string') throw new Error(`Usage: claude ${usage}`)
  const idMatches = jobs.filter(j => j.id.startsWith(query.toLowerCase()) || j.sessionId === query)
  if (idMatches.length === 1) return idMatches[0]
  if (idMatches.length > 1) throw new Error(`Ambiguous prefix '${query}', matches: ${idMatches.map(x => x.id).join(', ')}`)
  const named = name ? jobs.filter(j => j.name?.toLowerCase().includes(query.toLowerCase())) : []
  if (named.length === 1) return named[0]
  if (named.length > 1) throw new Error(`Ambiguous prefix '${query}', matches: ${named.map(x => x.id).join(', ')}`)
  throw new Error(`No job matching '${query}'. Run 'claude agents' to list running sessions.`)
}
export async function readTail(file: string, maxBytes: number = MAX_LOG_BYTES): Promise<string> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || maxBytes > MAX_LOG_BYTES) {
    throw new RangeError(`Log tail must be between 0 and ${MAX_LOG_BYTES} bytes`)
  }
  // Open first, then inspect and read through the SAME descriptor: a rotated
  // or replaced log pathname cannot change the file we actually read.
  const fh = await open(file, 'r')
  try {
    const info = await fh.stat()
    if (!info.isFile()) throw new Error('Background session log is not a regular file')
    const count = Math.min(maxBytes, info.size)
    if (count === 0) return ''
    const buffer = Buffer.alloc(count)
    const offset = info.size - count
    let read = 0
    // FileHandle.read may return fewer bytes than requested, especially while
    // another process truncates or appends to the log.
    while (read < count) {
      const { bytesRead } = await fh.read(buffer, read, count - read, offset + read)
      if (bytesRead === 0) break
      read += bytesRead
    }
    return buffer.subarray(0, read).toString('utf8')
  } finally {
    await fh.close()
  }
}
export function stripUnsafeTerminal(text: string): string {
  // Keep terminal cursor/SGR sequences while removing OSC/DCS payloads.
  // Construct control bytes explicitly so the same policy works with Unicode
  // output and does not introduce literal C0 characters in source patterns.
  const escapeCode = String.fromCharCode(27)
  const bell = String.fromCharCode(7)
  const osc = new RegExp(`${escapeCode}\\][^${bell}${escapeCode}]*(?:${bell}|${escapeCode}\\\\)`, 'g')
  const dcs = new RegExp(`${escapeCode}P[\\s\\S]*?${escapeCode}\\\\`, 'g')
  return text.replace(osc, '').replace(dcs, '').split('').filter(char => {
    const code = char.charCodeAt(0)
    return (code >= 32 && code !== 127) || code === 9 || code === 10 || code === 27
  }).join('')
}

export type WorktreeSafety317 = { ok: boolean; path: string | null; reason?: string }
export function worktreeSafety(worktreePath: string | null | undefined): WorktreeSafety317 {
  if (!worktreePath) return { ok: true, path: null }
  const worktree = resolve(worktreePath)
  const status = spawnSync('git', ['-C', worktree, 'status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8', timeout: 8000 })
  if (status.error || status.status !== 0) throw new Error(`Cannot inspect worktree: ${status.stderr || status.error?.message}`)
  if (status.stdout.trim()) return { ok: false, reason: 'worktree contains uncommitted changes', path: worktree }
  const upstream = spawnSync('git', ['-C', worktree, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], { encoding: 'utf8', timeout: 8000 })
  if (upstream.status !== 0) return { ok: false, reason: 'worktree has no tracking upstream; unpushed work cannot be ruled out', path: worktree }
  const commits = spawnSync('git', ['-C', worktree, 'rev-list', '--count', '@{upstream}..HEAD'], { encoding: 'utf8', timeout: 8000 })
  if (commits.status !== 0 || Number(commits.stdout.trim()) > 0) return { ok: false, reason: 'worktree has unpushed commits', path: worktree }
  return { ok: true, path: worktree }
}
export function worktreeDigest(worktreePath: string): string {
  return createHash('sha256').update(resolve(worktreePath)).digest('hex').slice(0, 12)
}
export async function removeWorktreeSafely(worktreePath: string | null | undefined,
  { discardUnpushed, forceRemoveWorktree }: BackgroundRmOptions317 = {}): Promise<void> {
  if (!worktreePath) return
  const safety = worktreeSafety(worktreePath)
  const digest = worktreeDigest(worktreePath)
  if (!safety.ok) {
    if (!discardUnpushed || discardUnpushed.worktreeDigest !== digest)
      throw new Error(`${safety.reason}; no deletion performed. Worktree id: ${digest}`)
    const head = spawnSync('git', ['-C', worktreePath, 'rev-parse', 'HEAD'], { encoding: 'utf8', timeout: 8000 })
    if (head.status !== 0 || head.stdout.trim().toLowerCase() !== discardUnpushed.headSha.toLowerCase())
      throw new Error('Worktree HEAD changed since approval; no deletion performed')
  }
  const args = ['-C', dirname(worktreePath), 'worktree', 'remove', worktreePath]
  if (!safety.ok || forceRemoveWorktree) {
    if (forceRemoveWorktree !== digest && !discardUnpushed) throw new Error('Invalid worktree confirmation digest')
    args.push('--force')
  }
  const removal = spawnSync('git', args, { encoding: 'utf8', timeout: 20000 })
  if (removal.status !== 0) throw new Error(`Could not remove worktree: ${removal.stderr}`)
}
