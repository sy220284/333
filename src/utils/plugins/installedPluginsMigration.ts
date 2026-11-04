import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'

const MAX_REGISTRY_BYTES = 16 * 1024 * 1024
const PLUGIN_ID = /^[a-z0-9][-a-z0-9._]*@[a-z0-9][-a-z0-9._]*$/i
const SCOPES = new Set(['managed', 'user', 'project', 'local'])
const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)

function readRegistry(path) {
  let stat
  try {
    stat = fs.lstatSync(path)
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
  if (!stat.isFile() || stat.nlink !== 1 || stat.size > MAX_REGISTRY_BYTES) {
    throw new Error(`Unsafe installed-plugin registry: ${path}`)
  }
  const bytes = fs.readFileSync(path)
  if (bytes.length > MAX_REGISTRY_BYTES) throw new Error(`Oversized installed-plugin registry: ${path}`)
  const data = JSON.parse(bytes.toString('utf8'))
  if (!isObject(data) || !isObject(data.plugins)) throw new Error(`Invalid installed-plugin registry: ${path}`)
  const version = data.version ?? 1
  if (version !== 1 && version !== 2) throw new Error(`Unsupported installed-plugin registry version ${version}: ${path}`)
  for (const [id, records] of Object.entries(data.plugins)) {
    if (!PLUGIN_ID.test(id)) throw new Error(`Invalid plugin ID in ${path}: ${id}`)
    if (version === 1) {
      if (!isObject(records) || typeof records.version !== 'string' || !records.version ||
          typeof records.installedAt !== 'string' || typeof records.installPath !== 'string') {
        throw new Error(`Invalid V1 plugin record for ${id} in ${path}`)
      }
    } else if (!Array.isArray(records) || records.some(record =>
      !isObject(record) || typeof record.scope !== 'string' || !SCOPES.has(record.scope) || typeof record.installPath !== 'string' ||
      (record.projectPath !== undefined && typeof record.projectPath !== 'string')
    )) {
      throw new Error(`Invalid V2 plugin records for ${id} in ${path}`)
    }
  }
  return { path, bytes, data, version }
}

/**
 * Read-only V1 conversion follows 2.1.317's Cpt/NLe path: old installations
 * remain usable without mutating user files (e.g. `plugin list --json`).
 * A separate explicit migration performs backed-up writes at startup or mutation.
 */
export function normalizeInstalledPluginsRecords(data, resolveCachePath) {
  if (!isObject(data) || !isObject(data.plugins)) {
    throw new Error('Invalid installed-plugin registry')
  }
  if (data.version === 2) return data
  if (data.version !== undefined && data.version !== 1) {
    throw new Error('Unsupported installed-plugin registry version')
  }
  for (const [id, record] of Object.entries(data.plugins)) {
    if (!PLUGIN_ID.test(id) || !isObject(record) ||
        typeof record.version !== 'string' || !record.version ||
        typeof record.installedAt !== 'string' || typeof record.installPath !== 'string') {
      throw new Error('Invalid V1 plugin installation record: ' + id)
    }
  }
  return convertV1(data, resolveCachePath)
}

function convertV1(registry, resolveCachePath) {
  const plugins = Object.create(null)
  for (const [id, record] of Object.entries(registry.plugins)) {
    // Preserve the exact validated V1 shape at the private conversion boundary.
    if (!isObject(record) || typeof record.version !== 'string' ||
        typeof record.installedAt !== 'string' || typeof record.installPath !== 'string') {
      throw new Error('Invalid V1 plugin installation record: '+id)
    }
    plugins[id] = [{
      scope: 'user',
      installPath: resolveCachePath(id, record.version),
      version: record.version,
      installedAt: record.installedAt,
      ...(record.lastUpdated !== undefined && { lastUpdated: record.lastUpdated }),
      ...(record.gitCommitSha !== undefined && { gitCommitSha: record.gitCommitSha }),
    }]
  }
  return { version: 2, plugins }
}

function mergeRegistries(primary, secondary) {
  const plugins = Object.create(null)
  for (const [id, records] of Object.entries(primary.plugins)) {
    if (!Array.isArray(records)) throw new Error('Expected V2 plugin installation list: '+id)
    plugins[id] = records.map(record => ({ ...record }))
  }
  if (!secondary) return { version: 2, plugins }
  for (const [id, records] of Object.entries(secondary.plugins)) {
    if (!Array.isArray(records)) throw new Error('Expected V2 plugin installation list: '+id)
    const current = plugins[id] ?? []
    for (const incoming of records) {
      const matching = current.find(record => record.scope === incoming.scope && record.projectPath === incoming.projectPath)
      if (matching) {
        if (!isDeepStrictEqual(matching, incoming)) {
          throw new Error(`Conflicting plugin installation: ${id} (${incoming.scope}, ${incoming.projectPath ?? 'global'}); both registries preserved`)
        }
      } else current.push({ ...incoming })
    }
    plugins[id] = current
  }
  return { version: 2, plugins }
}

function backupRegistry(registry) {
  const digest = createHash('sha256').update(registry.bytes).digest('hex').slice(0, 16)
  const backupPath = `${registry.path}.before-v2-${digest}.bak`
  try {
    fs.writeFileSync(backupPath, registry.bytes, { flag: 'wx', mode: 0o600 })
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error
  }
  if (!fs.readFileSync(backupPath).equals(registry.bytes)) {
    throw new Error(`Plugin registry backup does not match original: ${backupPath}`)
  }
  return backupPath
}

function writeRegistryAtomically(path, value) {
  const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`
  let fd
  try {
    fd = fs.openSync(temporary, 'wx', 0o600)
    fs.writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
    fs.fsyncSync(fd)
    fs.closeSync(fd)
    fd = undefined
    fs.renameSync(temporary, path)
  } finally {
    if (fd !== undefined) fs.closeSync(fd)
    try { fs.unlinkSync(temporary) } catch (error) { if (error?.code !== 'ENOENT') throw error }
  }
}

/** One boundary for V1/V2 registry migration. Unknown or conflicting records never get overwritten. */
export function migrateInstalledPluginsRecords(pluginsDirectory, resolveCachePath) {
  const canonicalPath = join(pluginsDirectory, 'installed_plugins.json')
  const priorV2Path = join(pluginsDirectory, 'installed_plugins_v2.json')
  const canonical = readRegistry(canonicalPath)
  const priorV2 = readRegistry(priorV2Path)
  if (!priorV2 && (!canonical || canonical.version === 2)) return false
  if (priorV2 && priorV2.version !== 2) throw new Error(`Expected a V2 registry at ${priorV2Path}`)

  const primary = canonical
    ? canonical.version === 1 ? convertV1(canonical.data, resolveCachePath) : canonical.data
    : { version: 2, plugins: {} }
  const result = mergeRegistries(primary, priorV2?.data)
  if (canonical) backupRegistry(canonical)
  if (priorV2) backupRegistry(priorV2)
  // Re-check before the atomic replace; an intervening writer must be retried, not overwritten.
  if (canonical && !fs.readFileSync(canonicalPath).equals(canonical.bytes)) throw new Error('Installed plugins changed during migration')
  if (priorV2 && !fs.readFileSync(priorV2Path).equals(priorV2.bytes)) throw new Error('V2 installed plugins changed during migration')
  writeRegistryAtomically(canonicalPath, result)
  const verified = readRegistry(canonicalPath)
  if (!verified || verified.version !== 2 || JSON.stringify(verified.data) !== JSON.stringify(result)) {
    throw new Error('Installed plugin registry migration verification failed; original copies are retained')
  }
  // The prior V2 filename is retired only after canonical readback; its hashed backup remains.
  if (priorV2) fs.unlinkSync(priorV2Path)
  return true
}
