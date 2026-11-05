import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { execFileNoThrowWithCwd } from '../execFileNoThrow.js'
import { gitExe } from '../git.js'
import { localCatalogRevision } from './commandSourceConsent.ts'

async function readable(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if (error instanceof Error && 'code' in error &&
      (error.code === 'ENOENT' || error.code === 'ENOTDIR')) return null
    throw error
  }
}

/**
 * Match official 2.1.317 marketplace-revision identity before command consent.
 * A Git checkout uses its commit ID; directory catalogs are content-hashed,
 * including package.json when provided by that marketplace.
 */
export async function getCommandSourceCatalogRevision(marketplaceRoot: string): Promise<string> {
  const gitDir = join(marketplaceRoot, '.git')
  const isGit = await stat(gitDir).then(() => true, error => {
    if (error instanceof Error && 'code' in error &&
      (error.code === 'ENOENT' || error.code === 'ENOTDIR')) return false
    throw error
  })
  if (isGit) {
    const head = await execFileNoThrowWithCwd(gitExe(), ['rev-parse', 'HEAD'], {
      cwd: marketplaceRoot,
      stdin: 'ignore',
    })
    if (head.code !== 0 || !/^[a-f0-9]{40,64}$/i.test(head.stdout.trim())) {
      throw new Error('Marketplace git revision cannot be determined for command authorization')
    }
    return 'git:' + head.stdout.trim()
  }
  const manifest = await readable(join(marketplaceRoot, '.claude-plugin', 'marketplace.json')) ??
    await readable(marketplaceRoot)
  if (manifest === null) throw new Error('Marketplace manifest missing; command cannot be authorized')
  const pkg = await readable(join(marketplaceRoot, 'package.json'))
  return localCatalogRevision(manifest, pkg)
}
