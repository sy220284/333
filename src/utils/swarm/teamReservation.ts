import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { getTeamsDir } from '../envUtils.js'
import { sanitizeName } from './teamHelpers.js'

/**
 * Atomically allocate a team directory. A read-then-write existence check
 * allows concurrent desktop SDK leaders to overwrite each other's roster.
 * mkdir without recursive is the cross-process reservation primitive.
 */
export async function reserveTeamDirectory(
  requestedName: string,
  root: string = getTeamsDir(),
): Promise<{ teamName: string; teamDir: string }> {
  const cleaned = requestedName.trim()
  if (!cleaned || !sanitizeName(cleaned).replace(/-/g, ''))
    throw new Error('团队名称必须包含英文字母或数字')
  await mkdir(root, { recursive: true, mode: 0o700 })
  for (let attempt = 0; attempt < 10; attempt++) {
    const teamName = attempt === 0
      ? cleaned
      : `${cleaned.slice(0, 64)}-${randomUUID().replaceAll('-', '').slice(0, 8)}`
    const teamDir = join(root, sanitizeName(teamName))
    try {
      await mkdir(teamDir, { mode: 0o700 })
      return { teamName, teamDir }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
  }
  throw new Error('连续 10 次团队名称冲突，请重新指定名称')
}
