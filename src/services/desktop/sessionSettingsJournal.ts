/** Per-workspace SDK session options: user-selected settings must survive desktop restarts.
 * An absent value means unknown for a pre-migration transcript; never guess a safe mode. */
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { z } from 'zod/v4'

const permissionSchema = z.enum(['default','acceptEdits','bypassPermissions','plan','dontAsk'])
export type DesktopPermissionMode = z.infer<typeof permissionSchema>
export type DesktopSessionSettings = {
  model: string | null
  permissionMode: DesktopPermissionMode | null
}
const schema = z.object({
  version: z.literal(1),
  model: z.string().min(1).max(300).nullable(),
  permissionMode: permissionSchema.nullable(),
}).strict()
const validSession = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i

export function createDesktopSessionSettingsJournal(
  cwd: string,
  root: string = join(homedir(), '.yaoyaoche', 'desktop'),
) {
  const workspace = createHash('sha256').update(resolve(cwd)).digest('hex')
  const directory = join(resolve(root), workspace, 'session-settings')
  const pending = new Map<string, Promise<void>>()
  function pathFor(id: string) {
    if (!validSession.test(id)) throw new TypeError('Invalid session settings ID')
    return join(directory, `${id}.json`)
  }
  return {
    async read(id: string): Promise<DesktopSessionSettings | null> {
      const path = pathFor(id)
      await pending.get(id)
      let data: string
      try { data = await readFile(path, 'utf8') }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw error
      }
      if (Buffer.byteLength(data) > 4096) throw new Error('Session settings exceed size limit')
      const parsed = schema.parse(JSON.parse(data))
      return { model: parsed.model, permissionMode: parsed.permissionMode }
    },
    write(id: string, settings: DesktopSessionSettings): Promise<void> {
      const path = pathFor(id)
      const content = JSON.stringify(schema.parse({ version: 1, ...settings }))
      const previous = pending.get(id) ?? Promise.resolve()
      const job = previous.then(async () => {
        await mkdir(directory, { recursive: true, mode: 0o700 })
        const temporary = `${path}.${randomUUID()}.tmp`
        try {
          await writeFile(temporary, content, { flag: 'wx', mode: 0o600 })
          await rename(temporary, path)
        } finally { await rm(temporary, { force: true }) }
      })
      pending.set(id, job)
      void job.finally(() => { if (pending.get(id) === job) pending.delete(id) }).catch(() => {})
      return job
    },
  }
}
