import { existsSync, realpathSync, statSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'

/**
 * Locate the packaged ripgrep relative to a physical CLI executable or
 * source bundle. Bun --compile may expose a virtual import.meta.url; it is
 * not a place from which native child processes can be spawned.
 *
 * Only accept physical executable/module paths: never search cwd or PATH
 * for an implicit fallback (a checked-out repository can contain a rogue rg).
 */
export type PackagedRipgrepLookup317 = {
  execPath?: string | null
  argv0?: string | null
  scriptPath?: string | null
  modulePath?: string | null
  arch: string
  platform: string
}
export type PackagedRipgrepResult317 = { path: string | null; candidates: string[] }
export function resolvePackagedRipgrep({
  execPath, argv0, scriptPath, modulePath, arch, platform,
}: PackagedRipgrepLookup317): PackagedRipgrepResult317 {
  const executable = platform === 'win32' ? 'rg.exe' : 'rg'
  const platformDir = arch + '-' + platform
  const locations = [execPath, argv0, scriptPath, modulePath]
  const inspected = []
  for (const candidate of locations) {
    if (typeof candidate !== 'string' || !candidate ||
        candidate.startsWith('/$bunfs/') ||
        candidate.startsWith('B:~BUN') ||
        candidate.includes('\\~BUN\\')) continue
    // Process arguments can contain a relative CLI filename. Only treat
    // relative names with path separators as paths; bare command names must
    // never be resolved against a repository's working directory.
    if (!isAbsolute(candidate) && !/[\\/]/.test(candidate)) continue
    let physical
    try {
      const absolute = isAbsolute(candidate) ? candidate : resolve(candidate)
      if (!statSync(absolute).isFile()) continue
      physical = realpathSync(absolute)
    } catch {
      continue
    }
    const location = resolve(dirname(physical), 'vendor', 'ripgrep', platformDir, executable)
    inspected.push(location)
    if (!existsSync(location)) continue
    const stats = statSync(location)
    if (stats.isFile()) return { path: location, candidates: inspected }
  }
  return { path: null, candidates: inspected }
}
