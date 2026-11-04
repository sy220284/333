/** Project purge semantics from 2.1.317 chunk-6gzy9446.js (filesystem storage).
 * Planning is read-only. History rewrites share the history writer's lock and
 * publish atomically, refusing links and changes observed during the rewrite.
 */
import { constants, createReadStream } from 'node:fs'
import { lstat, open, readdir, realpath, rename, rm } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { randomBytes } from 'node:crypto'
import { basename, dirname, join, resolve, sep } from 'node:path'
import lockfile from 'proper-lockfile'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const sibling = name => /^history\.jsonl\.tmp\.[0-9a-f]{8}$/.test(name) || /^\.[0-9a-f]{16}\.tmp$/.test(name)
const isAbsent = error => error?.code === 'ENOENT'
async function metadata(path) {
  try { return await lstat(path) } catch (error) { if (isAbsent(error)) return null; throw error }
}
async function entries(path) {
  try { return await readdir(path, { withFileTypes: true }) } catch (error) { if (isAbsent(error)) return []; throw error }
}
function belongs(path, paths) {
  return typeof path === 'string' && paths.some(root => path === root || path.startsWith(root + sep))
}
function splitRecords(text) {
  return text.split(/\n/).flatMap(line => line.split('\r').flatMap(record => {
    if (!/[\u2028\u2029]/.test(record)) return [record]
    try { JSON.parse(record); return [record] } catch { return record.split(/[\u2028\u2029]/) }
  }))
}
function historyMatches(line, paths) {
  try { return belongs(JSON.parse(line).project, paths) } catch { return false }
}
async function readHistory(path) {
  const info = await metadata(path)
  if (!info) return null
  if (!info.isFile() || info.nlink !== 1) throw new Error('history.jsonl must be a regular file, not a symlink or hard link')
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const actual = await file.stat()
    if (!actual.isFile() || actual.ino !== info.ino || actual.dev !== info.dev) throw new Error('history.jsonl changed before it could be read')
    const text = await file.readFile('utf8')
    const after = await file.stat()
    if (!sameSnapshot(actual, after)) throw new Error('history.jsonl changed while it was being read; retry the purge')
    return { text, info: after }
  } finally { await file.close() }
}
function sameSnapshot(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs
}
async function transcriptCwd(path) {
  const stream = createReadStream(path, { encoding: 'utf8' })
  const lines = createInterface({ input: stream, crlfDelay: Infinity })
  try {
    let count = 0
    for await (const line of lines) {
      for (const record of splitRecords(line)) {
        if (++count > 50) return null
        try { const cwd = JSON.parse(record).cwd; if (typeof cwd === 'string') return cwd } catch { /* Non-message records do not establish ownership. */ }
      }
    }
    return null
  } finally { lines.close(); stream.destroy() }
}
async function directoryOwnership(path, paths) {
  const sessions = (await entries(path)).filter(entry => entry.isFile() && entry.name.endsWith('.jsonl')).sort((a, b) => a.name.localeCompare(b.name))
  for (const session of sessions) {
    const cwd = await transcriptCwd(join(path, session.name))
    if (cwd !== null) return belongs(cwd, paths)
  }
  return null
}

export async function planPurge(home, project, { all = false, projectKeys = [], configAliases = [] } = {}) {
  home = resolve(home)
  const items = [], warnings = []
  if (all) {
    for (const [name, reason] of [['projects', 'all project transcripts (.jsonl) and memory/'], ['tasks', 'all session task lists'], ['debug', 'all session debug logs'], ['file-history', 'all session file edit history']]) {
      const path = join(home, name)
      if (await metadata(path)) items.push({ path, kind: 'dir', reason })
    }
    const history = join(home, 'history.jsonl')
    if (await metadata(history)) items.push({ path: history, kind: 'file', reason: 'prompt history across all projects' })
    if ((await entries(home)).some(entry => sibling(entry.name))) items.push({ path: history, kind: 'history-siblings', reason: 'staging copies a crashed history rewrite left beside it' })
    for (const key of projectKeys) items.push({ path: key, kind: 'config-key', reason: 'project entry in ~/.claude.json (trust, history, MCP servers)' })
  } else {
    if (!project) throw new Error('A project path is required unless --all is used')
    const requested = resolve(project).normalize('NFC')
    let canonical = requested
    try { canonical = (await realpath(requested)).normalize('NFC') } catch (error) { if (!isAbsent(error)) throw error }
    // macOS may canonicalize /var to /private/var. The project's saved
    // configuration key retains the original spelling and its transcript
    // directory uses that spelling. Include only keys whose realpath is the
    // exact same project, so aliases remain discoverable without sweeping
    // unrelated paths that share a string prefix.
    const paths = [requested, canonical]
    for (const alias of [...projectKeys, ...configAliases]) {
      const normalized = resolve(alias).normalize('NFC')
      if (paths.includes(normalized)) continue
      try {
        if ((await realpath(normalized)).normalize('NFC') === canonical) {
          paths.push(normalized)
        }
      } catch (error) {
        if (!isAbsent(error)) throw error
      }
    }
    const roots = paths.map(path => path.replace(/[^a-zA-Z0-9]/g, '-'))
    const directories = []
    for (const entry of await entries(join(home, 'projects'))) {
      if (!entry.isDirectory()) continue
      const exact = roots.some(root => entry.name === root || (root.length > 200 && entry.name.startsWith(root.slice(0, 200) + '-')))
      const prefixed = roots.some(root => entry.name.startsWith(root + '-'))
      if (!exact && !prefixed) continue
      const path = join(home, 'projects', entry.name)
      const owned = await directoryOwnership(path, paths)
      if (owned === true || (exact && owned === null)) directories.push(path)
    }
    const sessions = new Set()
    for (const path of directories) for (const entry of await entries(path)) {
      if (entry.isFile() && entry.name.endsWith('.jsonl') && uuid.test(entry.name.slice(0, -6))) sessions.add(entry.name.slice(0, -6))
    }
    for (const id of sessions) {
      for (const [path, kind, reason] of [[join(home, 'tasks', id), 'dir', `tasks for session ${id}`], [join(home, 'debug', `${id}.txt`), 'file', `debug log for session ${id}`], [join(home, 'file-history', id), 'dir', `file edit history for session ${id}`]]) {
        if (await metadata(path)) items.push({ path, kind, reason })
      }
    }
    for (const path of directories) items.push({ path, kind: 'dir', reason: 'project transcripts (.jsonl) and memory/' })
    const configPaths = new Set([...paths, ...configAliases].map(path => path.replace(/\\/g, '/').replace(/\/+$/, '') || '/'))
    for (const key of projectKeys) if (configPaths.has(key.replace(/\\/g, '/').replace(/\/+$/, '') || '/')) {
      items.push({ path: key, kind: 'config-key', reason: 'project entry in ~/.claude.json (trust, history, MCP servers)' })
    }
    const history = join(home, 'history.jsonl'), snapshot = await readHistory(history)
    const matched = snapshot ? splitRecords(snapshot.text).filter(line => historyMatches(line, paths)).length : 0
    if (matched) items.push({ path: history, kind: 'history-lines', matchPaths: paths, reason: `${matched} prompt(s) typed in this project` })
  }
  if (await metadata(join(home, 'shell-snapshots'))) warnings.push('shell-snapshots/ are not project-scoped and will not be touched')
  if (await metadata(join(home, 'backups'))) warnings.push(`backups/ may still contain ${all ? 'project entries' : 'this project entry'} in old .claude.json snapshots (${join(home, 'backups')}); at most 5 are kept and they rotate out automatically`)
  return { items, warnings }
}

async function withHistoryLock(path, operation, { allowMissing = false } = {}) {
  const info = await metadata(path)
  if (!info && !allowMissing) return
  if (info && (!info.isFile() || info.nlink !== 1)) throw new Error('history.jsonl must be a regular file, not a symlink or hard link')
  let compromised = false
  const release = await lockfile.lock(path, { realpath: false, stale: 10_000, retries: { retries: 3, minTimeout: 50 }, onCompromised: () => { compromised = true } })
  try {
    return await operation(() => { if (compromised) throw new Error('The history lock was compromised before the rewrite') })
  } finally { await release() }
}
async function filterHistory(path, paths) {
  return withHistoryLock(path, async checkLock => {
    const snapshot = await readHistory(path)
    if (!snapshot) return
    const records = splitRecords(snapshot.text)
    if (!records.some(line => historyMatches(line, paths))) return
    const kept = records.filter(line => !historyMatches(line, paths))
    if (kept.at(-1) === '') kept.pop()
    const staging = join(dirname(path), `.${randomBytes(8).toString('hex')}.tmp`)
    try {
      const output = await open(staging, 'wx', snapshot.info.mode & 0o777)
      try {
      await output.writeFile(kept.length ? kept.join('\n') + '\n' : '', 'utf8')
      await output.chmod(snapshot.info.mode & 0o777)
      await output.sync()
      } finally { await output.close() }
      checkLock()
      const current = await metadata(path)
      if (!current || !sameSnapshot(snapshot.info, current)) throw new Error('history.jsonl changed before the rewrite; source history was preserved, retry the purge')
      await rename(staging, path)
    } finally { await rm(staging, { force: true }) }
  })
}
async function cleanHistorySiblings(path) {
  return withHistoryLock(path, async checkLock => {
    const recent = []
    for (const entry of await entries(dirname(path))) {
      if (!sibling(entry.name)) continue
      const target = join(dirname(path), entry.name), info = await metadata(target)
      if (!info?.isFile()) continue
      if (!entry.name.startsWith('history.jsonl.tmp.') && info.mtimeMs > Date.now() - 60_000) { recent.push(entry.name); continue }
      checkLock()
      await rm(target)
    }
    if (recent.length) throw new Error(`Recent history staging files remain (${recent.join(', ')}); a live writer may own them. Re-run in a minute.`)
  }, { allowMissing: true })
}

export async function executePurgeItem(item, { removeProject } = {}) {
  switch (item.kind) {
    case 'config-key':
      if (!removeProject) throw new Error('Project config removal requires the configuration writer')
      await removeProject(item.path)
      return
    case 'history-lines': return filterHistory(item.path, item.matchPaths ?? [])
    case 'history-siblings': return cleanHistorySiblings(item.path)
    case 'file':
      if (basename(item.path) === 'history.jsonl') return withHistoryLock(item.path, async checkLock => { checkLock(); await rm(item.path, { force: true }) })
      return rm(item.path, { force: true })
    case 'dir': return rm(item.path, { recursive: true, force: true })
    default: throw new Error(`Unknown purge item kind: ${item.kind}`)
  }
}
