import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const dist = join(root, 'dist')
const candidate = join(dist, 'cli.js')
const nativeName = process.platform === 'win32' ? 'yaoyaoche.exe' : 'yaoyaoche'
const executable = join(dist, nativeName)
const desktopName = process.platform === 'win32' ? 'desktopHost.exe' : 'desktopHost'
const desktopExecutable = join(dist, desktopName)
const desktopSource = join(dist, 'desktopHost.js')
if (!existsSync(desktopSource)) throw Error('Desktop source bundle missing: ' + desktopSource)
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version

if (!/^\d+\.\d+\.\d+$/.test(version)) throw Error('Invalid target release version')
if (!existsSync(candidate)) throw Error('Run bun build/rebuild.mjs before compiling the standalone binary')

// Compile the actual JS emitted by the frozen source rebuild, not the old
// checked-in root CLI or a downloaded official executable. This embeds Bun
// and allows the distribution to run without a system Bun installation.
const built = spawnSync('bun', ['build', 'dist/cli.js', '--compile', '--outfile', 'dist/yaoyaoche'], {
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

// The desktop host embeds its own Bun runtime, so shipped clients launch it
// directly without a global package manager or terminal renderer.
const builtDesktop = spawnSync('bun', ['build', 'dist/desktopHost.js', '--compile', '--outfile', 'dist/desktopHost'], {
  cwd: root, stdio: 'inherit', windowsHide: true, timeout: 180_000,
})
if (builtDesktop.error) throw builtDesktop.error
if (builtDesktop.status !== 0) throw Error('Desktop host standalone compilation failed with exit ' + builtDesktop.status)
if (!existsSync(desktopExecutable) || !statSync(desktopExecutable).isFile() ||
  statSync(desktopExecutable).size < 10_000_000) {
  throw Error('Desktop host native executable is invalid: ' + desktopExecutable)
}
const handshake = spawnSync(desktopExecutable, [], {
  cwd: root, encoding: 'utf8',
  input: JSON.stringify({ id: 'packaging-probe', method: 'hello' }) + String.fromCharCode(10),
  timeout: 30_000, maxBuffer: 1024 * 1024, windowsHide: true,
})
if (handshake.error) throw handshake.error
if (handshake.status !== 0) throw Error('Desktop host handshake failed: ' + handshake.stderr)
const greeting = JSON.parse(handshake.stdout.trim())
if (!greeting.ok || greeting.id !== 'packaging-probe' || greeting.result?.protocolVersion !== 1) {
  throw Error('Desktop host returned an invalid versioned JSON protocol handshake')
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
verify(['--version'], stdout => stdout.trim() === `${version} (摇摇车)`)
verify(['--help'], stdout => stdout.includes('Usage:') && stdout.includes('--print'))
console.log('Verified independent CLI and desktop host binaries for ' + process.platform + ': ' + executable + ', ' + desktopExecutable)
