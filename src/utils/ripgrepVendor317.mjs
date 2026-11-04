import { existsSync, realpathSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'

/**
 * Locate the packaged ripgrep relative to a physical CLI executable or
 * source bundle. Bun --compile may expose a virtual import.meta.url; it is
 * not a place from which native child processes can be spawned.
 *
 * Only accept physical executable/module paths: never search cwd or PATH
 * for an implicit fallback (a checked-out repository can contain a rogue rg).
 */
export function resolvePackagedRipgrep({
  execPath, argv0, scriptPath, modulePath, arch, platform,
}) {
  const executable = platform === 'win32' ? 'rg.exe' : 'rg'
  const platformDir = arch + '-' + platform
  const locations = [execPath, argv0, scriptPath, modulePath]
  const inspected = []
  for (const candidate of locations) {
    if (!candidate || !isAbsolute(candidate) ||
        candidate.startsWith('/$bunfs/') ||
        candidate.startsWith('B:~BUN') ||
        candidate.includes('\\~BUN\\')) continue
    let physical
    try {
      // Verify each source locator is a physical file, not an unresolved
      // module or a directory supplied by an untrusted working tree.
      if (!statSync(candidate).isFile()) continue
      physical = realpathSync(candidate)
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
