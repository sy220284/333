import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { getTeamsDir } from '../envUtils.js'
import { getErrnoCode } from '../errors.js'
import * as lockfile from '../lockfile.js'
import { sanitizePathComponent } from '../tasks.js'

/**
 * Serialize teammate mailbox writes against TeamDelete/session cleanup.
 *
 * The lock target lives OUTSIDE the team directory: deleting that directory
 * must never unlink the lock another process is waiting on. Retain the small
 * guard file between runs so all processes agree on the same lock identity.
 */
export async function withTeamLifecycleLock<T>(
  teamName: string,
  operation: () => Promise<T>,
): Promise<T> {
  const guardDir = join(getTeamsDir(), '.team-lifecycle')
  await mkdir(guardDir, { recursive: true })
  const guard = join(guardDir, `${sanitizePathComponent(teamName)}.guard`)
  try {
    await writeFile(guard, '', { flag: 'wx' })
  } catch (error) {
    if (getErrnoCode(error) !== 'EEXIST') throw error
  }
  const release = await lockfile.lock(guard, {
    retries: { retries: 60, factor: 1.3, minTimeout: 25, maxTimeout: 500 },
  })
  try {
    return await operation()
  } finally {
    await release()
  }
}
