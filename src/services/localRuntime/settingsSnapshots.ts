/** Local, versioned settings snapshots. Never upload settings or prompt text. */
import { createHash, randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
const DIRECTORY = join(homedir(), '.333', 'settings-history')
const CURRENT = () => join(getClaudeConfigHomeDir(), 'settings.json')
type Entry = { id: string; timestamp: string; sha256: string; size: number }
function digest(contents: Buffer): string {
  return createHash('sha256').update(contents).digest('hex')
}
function parseSettings(bytes: Buffer): void {
  const data = JSON.parse(bytes.toString('utf8'))
  if (!data || Array.isArray(data) || typeof data !== 'object') {
    throw new Error('Invalid settings JSON document: root must be an object')
  }
}
async function atomicPrivateWrite(path: string, bytes: Buffer): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    await fs.writeFile(temporary, bytes, { mode: 0o600, flag: 'wx' })
    await fs.rename(temporary, path)
    await fs.chmod(path, 0o600)
  } finally { await fs.rm(temporary, { force: true }) }
}
export async function snapshotLocalSettings(): Promise<Entry> {
  const contents = await fs.readFile(CURRENT())
  parseSettings(contents)
  const entry: Entry = {
    id: `${Date.now()}-${randomUUID()}`, timestamp: new Date().toISOString(),
    sha256: digest(contents), size: contents.byteLength,
  }
  await fs.mkdir(DIRECTORY, { recursive: true, mode: 0o700 })
  await atomicPrivateWrite(join(DIRECTORY, `${entry.id}.json`), contents)
  await atomicPrivateWrite(join(DIRECTORY, `${entry.id}.meta.json`), Buffer.from(JSON.stringify(entry)))
  return entry
}
export async function listLocalSettingsSnapshots(): Promise<Entry[]> {
  let names: string[]
  try { names = await fs.readdir(DIRECTORY) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  const entries = await Promise.all(names.filter(name => /^\d+-[a-f0-9-]+\.meta\.json$/.test(name)).map(async name => {
    const entry = JSON.parse(await fs.readFile(join(DIRECTORY, name), 'utf8')) as Entry
    const contents = await fs.readFile(join(DIRECTORY, `${entry.id}.json`))
    if (digest(contents) !== entry.sha256) throw new Error(`Settings snapshot corrupted: ${entry.id}`)
    return entry
  }))
  return entries.sort((a,b) => b.timestamp.localeCompare(a.timestamp))
}
export async function restoreLocalSettings(snapshotId: string): Promise<void> {
  if (!/^\d+-[0-9a-f-]{36}$/.test(snapshotId)) throw new Error('Invalid settings snapshot ID')
  const snapshot = await fs.readFile(join(DIRECTORY, `${snapshotId}.json`))
  const meta = JSON.parse(await fs.readFile(join(DIRECTORY, `${snapshotId}.meta.json`),'utf8')) as Entry
  if (meta.id !== snapshotId || digest(snapshot) !== meta.sha256) throw new Error('Settings snapshot integrity validation failed')
  parseSettings(snapshot)
  // Preserve the current settings before any overwrite. This is a deliberate
  // local CLI operation, and original prompt assets are left untouched.
  try { await snapshotLocalSettings() }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  await fs.mkdir(getClaudeConfigHomeDir(), { recursive: true, mode: 0o700 })
  await atomicPrivateWrite(CURRENT(), snapshot)
}
