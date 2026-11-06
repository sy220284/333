import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { resolve, join } from 'node:path'
import { z } from 'zod/v4'
import type { DesktopTask } from './taskProjection.js'

const taskSchema = z.object({
  taskId: z.string(),
  description: z.string(),
  status: z.enum(['running', 'completed', 'failed', 'stopped', 'interrupted']),
  updatedAt: z.number(),
  toolUseId: z.string().optional(),
  taskType: z.string().optional(),
  workflowName: z.string().optional(),
  summary: z.string().optional(),
  lastToolName: z.string().optional(),
  outputFile: z.string().optional(),
  usage: z.object({
    total_tokens: z.number(), tool_uses: z.number(), duration_ms: z.number(),
  }).optional(),
})
const documentSchema = z.object({ version: z.literal(1), tasks: z.array(taskSchema) })

export type DesktopTaskJournal = {
  read(sessionId: string): Promise<DesktopTask[]>
  write(sessionId: string, tasks: DesktopTask[]): Promise<void>
}

/** Per-workspace, private and crash-safe task index. It stores progress
 * metadata, not prompts, credentials or API transcripts. */
export function createDesktopTaskJournal(
  cwd: string,
  dataRoot: string = join(homedir(), '.yaoyaoche', 'desktop'),
): DesktopTaskJournal {
  const workspace = createHash('sha256').update(resolve(cwd)).digest('hex')
  const directory = join(resolve(dataRoot), workspace)
  const pending = new Map<string, Promise<void>>()
  function pathFor(sessionId: string): string {
    if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(sessionId)) {
      throw new TypeError('Invalid task journal session ID')
    }
    return join(directory, sessionId + '.json')
  }
  return {
    async read(sessionId) {
      const path = pathFor(sessionId)
      await pending.get(sessionId)
      let raw: string
      try { raw = await readFile(path, 'utf8') }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
        throw error
      }
      if (Buffer.byteLength(raw) > 2_000_000) throw new Error('Desktop task journal exceeds its size limit')
      const parsed = documentSchema.parse(JSON.parse(raw))
      // A process restart cannot keep an in-memory agent process alive.
      return parsed.tasks.map(task => task.status === 'running'
        ? { ...task, status: 'interrupted' as const }
        : task)
    },
    write(sessionId, tasks) {
      const path = pathFor(sessionId)
      const previous = pending.get(sessionId) ?? Promise.resolve()
      const operation = previous.then(async () => {
        const content = JSON.stringify(documentSchema.parse({ version: 1, tasks }))
        if (Buffer.byteLength(content) > 2_000_000) throw new Error('Desktop task journal exceeds its size limit')
        await mkdir(directory, { recursive: true, mode: 0o700 })
        const tempPath = path + '.' + randomUUID() + '.tmp'
        try {
          await writeFile(tempPath, content, { mode: 0o600, flag: 'wx' })
          await rename(tempPath, path)
        } finally {
          await rm(tempPath, { force: true })
        }
      })
      pending.set(sessionId, operation)
      void operation.then(() => {
        if (pending.get(sessionId) === operation) pending.delete(sessionId)
      }, () => {})
      return operation
    },
  }
}
