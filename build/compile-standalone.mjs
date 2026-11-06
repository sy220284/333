import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const dist = join(root, 'dist')
const candidate = join(dist, 'cli.js')
const nativeName = process.platform === 'win32' ? 'claude.exe' : 'claude'
const executable = join(dist, nativeName)
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version

if (!/^\d+\.\d+\.\d+$/.test(version)) throw Error('Invalid target release version')
if (!existsSync(candidate)) throw Error('Run bun build/rebuild.mjs before compiling the standalone binary')

// Compile the actual JS emitted by the frozen source rebuild, not the old
// checked-in root CLI or a downloaded official executable. This embeds Bun
// and allows the distribution to run without a system Bun installation.
const built = spawnSync('bun', ['build', 'dist/cli.js', '--compile', '--outfile', 'dist/claude'], {
  cwd: root,
  stdio: 'inherit',
  windowsHide: true,
  timeout: 180_000,
})
if (built.error) throw built.error
if (built.status !== 0) throw Error('Standalone compilation failed with exit ' + built.status)
if (!existsSync(executable) || !statSync(executable).isFile() || statSync(executable).size < 10_000_000) {
  throw Error('Standalone binary missing, unexpectedly small or not regular: ' + executable)
}

function verify(args, expected) {
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 2 * 1024 * 1024,
    windowsHide: true,
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw Error('Standalone CLI ' + args.join(' ') + ': ' + result.stderr)
  if (!expected(result.stdout)) throw Error('Standalone CLI response mismatch: ' + args.join(' ') + '\n' + result.stdout)
}
verify(['--version'], stdout => stdout.trim() === version + ' (333)')
verify(['--help'], stdout => stdout.includes('Usage:') && stdout.includes('--print'))
console.log('Verified independent ' + process.platform + ' binary: ' + executable)
