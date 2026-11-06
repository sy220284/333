/**
 * Local task ledger derived from cloud task polling and restoration paths.
 * No cloud account, remote session or hosted scheduler is required.
 */
import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
type LocalTask = {
  id: string
  type: string
  status: string
  description?: string
  startTime?: number
}
export type LocalTaskEntry = LocalTask & { recordedAt: string }
const root = join(homedir(), '.qerivon', 'tasks')
const file = join(root, 'journal.ndjson')
const lastStates = new Map<string, string>()
let writing: Promise<void> = Promise.resolve()
export function recordLocalTaskState(task: LocalTask): Promise<void> {
  if (!task.id || !task.type || !task.status) return Promise.reject(new Error('Invalid local task state'))
  const signature = `${task.type}:${task.status}`
  if (lastStates.get(task.id) === signature) return writing
  const data: LocalTaskEntry = {
    id: task.id, type: task.type, status: task.status,
    ...(task.description ? { description: task.description.slice(0, 1024) } : {}),
    ...(task.startTime ? { startTime: task.startTime } : {}),
    recordedAt: new Date().toISOString(),
  }
  const next = writing.then(async () => {
    await fs.mkdir(root, { mode: 0o700, recursive: true })
    await fs.appendFile(file, `${JSON.stringify(data)}\n`, { encoding: 'utf8', mode: 0o600 })
    lastStates.set(task.id, signature)
  })
  writing = next.catch(error => {
    process.stderr.write(`[Qerivon task journal] ${String(error)}\n`)
  })
  return next
}
export async function readLocalTasks(): Promise<LocalTaskEntry[]> {
  await writing
  let lines: string
  try { lines = await fs.readFile(file, 'utf8') }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  const states = new Map<string, LocalTaskEntry>()
  for (const line of lines.split('\n')) {
    if (!line.trim()) continue
    const entry = JSON.parse(line) as LocalTaskEntry
    if (!entry.id || !entry.type || !entry.status) throw new Error('Corrupted local task journal')
    states.set(entry.id, entry)
  }
  return [...states.values()].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
}
