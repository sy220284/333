import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const dist = join(root, 'dist')
const candidate = join(dist, 'cli.js')
const nativeName = process.platform === 'win32' ? 'yaoyaoche.exe' : 'yaoyaoche'
const executable = join(dist, nativeName)
const desktopName = process.platform === 'win32' ? 'yaoyaoche-desktop.exe' : 'yaoyaoche-desktop'
const desktopExecutable = join(dist, desktopName)
const desktopSource = join(dist, 'desktopHost.js')
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version

if (!/^\d+\.\d+\.\d+$/.test(version)) throw Error('Invalid target release version')
if (!existsSync(candidate) || !existsSync(desktopSource))
  throw Error('Run bun build/rebuild.mjs before compiling the standalone binaries')

// Compile both actual rebuilt sources with embedded Bun. The published CLI
// and desktop SDK host then work without system Bun or repo node_modules.
function compileStandalone(source, outfile) {
  const built = spawnSync('bun', ['build', source, '--compile', '--outfile', outfile], {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
    timeout: 180_000,
  })
  if (built.error) throw built.error
  if (built.status !== 0) throw Error('Standalone compilation failed for ' + source + ' with exit ' + built.status)
  const artifact = join(root, outfile)
  if (!existsSync(artifact) || !statSync(artifact).isFile() || statSync(artifact).size < 10_000_000)
    throw Error('Standalone binary missing, unexpectedly small or not regular: ' + artifact)
}
compileStandalone('dist/cli.js', 'dist/' + nativeName)
compileStandalone('dist/desktopHost.js', 'dist/' + desktopName)

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
console.log('Verified independent ' + process.platform + ' binary: ' + executable)

// Exercise the desktop protocol in the actual compiled binary. A successful
// handshake must terminate after EOF without importing the REPL UI.
const handshake = spawnSync(desktopExecutable, [], {
  cwd: root, encoding: 'utf8', timeout: 30_000, windowsHide: true,
  input: '{"id":"release-smoke","method":"hello"}\n',
})
if (handshake.error) throw handshake.error
if (handshake.status !== 0) throw Error('Standalone desktop handshake failed: ' + handshake.stderr)
const frames = handshake.stdout.trim().split('\n').map(line => JSON.parse(line))
const reply = frames.find(frame => frame.id === 'release-smoke')
if (!reply?.ok || reply.result?.protocolVersion !== 1 || reply.result?.transport !== 'stdio-jsonl')
  throw Error('Standalone desktop protocol response mismatch: ' + handshake.stdout)
console.log('Verified independent ' + process.platform + ' desktop host: ' + desktopExecutable)
