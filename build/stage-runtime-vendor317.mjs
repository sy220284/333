import {
  chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync,
  renameSync, rmSync, statSync,
} from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'

/**
 * Source-mode CLI (bun dist/cli.js) and the compiled release require the same
 * verified, executable resources. Compilation must stage the host vendor
 * before model/tool integration tests, not after those tests have run.
 *
 * Only explicit files next to the source tree are accepted; no PATH/cwd or
 * system-ripgrep fallback can change which executable is launched.
 */
export function stageRuntimeVendor317(root, options = {}) {
  const platform = options.platform ?? process.platform
  const arch = options.arch ?? process.arch
  const host = arch + '-' + platform
  const binary = platform === 'win32' ? 'rg.exe' : 'rg'
  const vendorRoot = join(root, 'vendor')
  const dist = join(root, 'dist')
  const destination = join(dist, 'vendor')
  const stage = join(dist, '.vendor-runtime-stage-' + process.pid)
  const backup = join(dist, '.vendor-runtime-backup-' + process.pid)
  if (existsSync(stage) || existsSync(backup)) {
    throw new Error('A previous runtime vendor staging transaction is still present')
  }
  const files = [
    'ripgrep/COPYING',
    'ripgrep/' + host + '/' + binary,
    'audio-capture/' + host + '/audio-capture.node',
  ]
  const clipboard = 'clipboard-napi/' + host + '/clipboard-napi.node'
  if (existsSync(join(vendorRoot, clipboard))) files.push(clipboard)
  const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex')
  let backedUp = false
  try {
    mkdirSync(stage, { recursive: true })
    for (const file of files) {
      const input = join(vendorRoot, file)
      if (!existsSync(input) || !lstatSync(input).isFile()) {
        throw new Error('Missing or invalid 2.1.317 vendor resource: ' + file)
      }
      const output = join(stage, file)
      mkdirSync(dirname(output), { recursive: true })
      copyFileSync(input, output)
      if (sha(input) !== sha(output)) {
        throw new Error('2.1.317 runtime vendor checksum mismatch: ' + file)
      }
      if (file === 'ripgrep/' + host + '/' + binary && platform !== 'win32') {
        const mode = statSync(input).mode & 0o777
        if (!(mode & 0o111)) {
          throw new Error('Packaged ripgrep is not executable: ' + input)
        }
        chmodSync(output, mode)
      }
    }
    if (existsSync(destination)) {
      renameSync(destination, backup)
      backedUp = true
    }
    try {
      renameSync(stage, destination)
    } catch (error) {
      if (backedUp) renameSync(backup, destination)
      backedUp = false
      throw error
    }
    if (backedUp) {
      rmSync(backup, { recursive: true, force: true })
      backedUp = false
    }
    return { host, files }
  } finally {
    if (existsSync(stage)) rmSync(stage, { recursive: true, force: true })
    if (backedUp && existsSync(backup) && !existsSync(destination)) {
      renameSync(backup, destination)
    }
  }
}
