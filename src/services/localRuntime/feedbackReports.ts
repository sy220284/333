/**
 * Explicit user-submitted feedback saved locally. The report body is stored
 * only after a /feedback command, never appended to analytics diagnostics.
 */
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DIRECTORY = join(homedir(), '.333', 'feedback')
export interface LocalFeedbackReport {
  diagnostics?: LocalFeedbackDiagnostics
  id: string
  createdAt: string
  description: string
  source: '333-local'
}
export interface LocalFeedbackDiagnostics {
  environment: {
    version: string
    platform: string
    architecture: string
    nodeVersion: string
    activeModel: string | null
  }
  currentSessionCost: string
  localEventCounts: Record<string, number>
}

/** One local feedback archive shared by CLI and diagnostics export. */
export async function saveLocalFeedback(description: string, diagnostics?: LocalFeedbackDiagnostics): Promise<string> {
  const trimmed = description.trim()
  if (!trimmed) throw new Error('反馈内容为空')
  if (trimmed.length > 16_384) throw new Error('反馈内容不能超过 16384 字符')
  const id = randomUUID()
  const entry: LocalFeedbackReport = {
    id, createdAt: new Date().toISOString(), description: trimmed,
    source: '333-local',
    ...(diagnostics ? { diagnostics } : {}),
  }
  await fs.mkdir(DIRECTORY, { recursive: true, mode: 0o700 })
  const path = join(DIRECTORY, `${id}.json`)
  await fs.writeFile(path, JSON.stringify(entry, null, 2), { mode: 0o600, flag: 'wx' })
  return path
}
export async function listLocalFeedback(): Promise<LocalFeedbackReport[]> {
  let files: string[]
  try { files = await fs.readdir(DIRECTORY) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  const reports = await Promise.all(files.filter(name => /^[0-9a-f-]{36}\.json$/.test(name)).map(async name => {
    const candidate = JSON.parse(await fs.readFile(join(DIRECTORY, name), 'utf8')) as LocalFeedbackReport
    if (candidate.id !== name.slice(0,-5) || candidate.source !== '333-local') {
      throw new Error(`本地反馈记录已损坏：${name}`)
    }
    return candidate
  }))
  return reports.sort((a,b) => b.createdAt.localeCompare(a.createdAt))
}
