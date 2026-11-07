/** Private, project-scoped smart execution history. Only metadata is stored:
 * never task instructions, prompts, tool input, file names or credentials.
 * The existing transcript and task journals remain the detailed source of truth. */
import { createHash, randomUUID } from 'node:crypto'
import { readFile, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import * as lockfile from '../../utils/lockfile.js'

export type SmartExecutionRecord = {
  sessionId: string
  model: string
  permissionMode: string
  budgetUsd?: number
  status: 'running' | 'completed' | 'failed' | 'interrupted'
  startedAt: string
  finishedAt?: string
  costUsd?: number
  ownerPid?: number
  ownerId?: string
}
export type SmartExecutionJournal = {
  list(): Promise<SmartExecutionRecord[]>
  start(record: SmartExecutionRecord): Promise<void>
  finish(sessionId: string, status: 'completed' | 'failed' | 'interrupted', costUsd?: number): Promise<void>
  reconcile(ownerId: string, active: ReadonlySet<string>): Promise<void>
}

function verified(records: unknown): SmartExecutionRecord[] {
  if (!Array.isArray(records) || records.length > 300) throw new Error('Invalid smart execution journal')
  for (const record of records) {
    if (!record || typeof record !== 'object' || typeof record.sessionId !== 'string' ||
      typeof record.model !== 'string' || typeof record.permissionMode !== 'string' ||
      !['running','completed','failed','interrupted'].includes(record.status) ||
      typeof record.startedAt !== 'string') throw new Error('Invalid smart execution record')
  }
  return records as SmartExecutionRecord[]
}

export function getSmartExecutionJournalFile(
  projectDir: string,
  rootDir: string = join(homedir(), '.yaoyaoche', 'smart-executions'),
): string {
  return join(resolve(rootDir), `${createHash('sha256').update(resolve(projectDir)).digest('hex')}.json`)
}

export function createSmartExecutionJournal(
  projectDir: string,
  rootDir: string = join(homedir(), '.yaoyaoche', 'smart-executions'),
): SmartExecutionJournal {
  const file = getSmartExecutionJournalFile(projectDir, rootDir)
  async function read(): Promise<SmartExecutionRecord[]> {
    let raw: string
    try { raw = await readFile(file, 'utf8') }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
    if (Buffer.byteLength(raw) > 150_000) throw new Error('Smart execution journal exceeds size limit')
    return verified(JSON.parse(raw))
  }
  async function mutate(change: (old: SmartExecutionRecord[]) => SmartExecutionRecord[]): Promise<void> {
    await mkdir(resolve(rootDir), { mode: 0o700, recursive: true })
    try { await writeFile(file, '[]', { mode: 0o600, flag: 'wx' }) }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
    const release = await lockfile.lock(file, { retries: { retries: 8, minTimeout: 25, maxTimeout: 250 } })
    try {
      const next = verified(change(await read()))
      const content = JSON.stringify(next)
      if (Buffer.byteLength(content) > 150_000) throw new Error('Smart execution history exceeds size limit')
      const temp = `${file}.${randomUUID()}.tmp`
      try {
        await writeFile(temp, content, { mode: 0o600, flag: 'wx' })
        await rename(temp, file)
      } finally { await rm(temp, { force: true }) }
    } finally { await release() }
  }
  return {
    async list() {
      return (await read()).reverse()
    },
    async reconcile(ownerId, active) {
      const current = await read()
      const orphaned = current.filter(record => {
        if (record.status !== 'running' || active.has(record.sessionId)) return false
        if (record.ownerId === ownerId) return true
        if (!record.ownerPid) return true // Legacy records cannot claim a live host.
        try { process.kill(record.ownerPid, 0); return false }
        catch (error) {
          return (error as NodeJS.ErrnoException).code === 'ESRCH'
        }
      })
      if (!orphaned.length) return
      const ids = new Set(orphaned.map(item => item.sessionId))
      await mutate(old => old.map(record => ids.has(record.sessionId) && record.status === 'running'
        ? { ...record, status: 'interrupted', finishedAt: new Date().toISOString() }
        : record))
    },
    async start(record) {
      if (record.status !== 'running' || !record.sessionId || !record.model) throw new Error('Invalid execution start')
      await mutate(old => {
        if (old.some(item => item.sessionId === record.sessionId)) throw new Error('Duplicate execution session')
        return [...old, record].slice(-200)
      })
    },
    async finish(sessionId, status, costUsd) {
      if (costUsd !== undefined && (!Number.isFinite(costUsd) || costUsd < 0)) throw new Error('Invalid execution cost')
      await mutate(old => {
        const index = old.findIndex(item => item.sessionId === sessionId)
        if (index < 0) throw new Error('Unknown execution session')
        const record = old[index]
        if (!record) throw new Error('Unknown execution session')
        if (record.status !== 'running') throw new Error('Execution already finalized')
        return old.map((item, i) => i === index
          ? { ...item, status, finishedAt: new Date().toISOString(), ...(costUsd === undefined ? {} : { costUsd }) }
          : item)
      })
    },
  }
}
