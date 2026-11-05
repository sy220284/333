import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8')

test('2.1.316 shutdown registers live Shell children on macOS and Linux', () => {
  const shell=read('src/utils/ShellCommand.ts')
  assert.match(shell, /if \(process\.platform !== 'win32'\)/)
  assert.match(shell, /#unregisterShutdownCleanup = registerCleanup\(async \(\) =>/)
  assert.match(shell, /if \(this\.#childProcess\.exitCode !== null \|\|/)
  assert.match(shell, /this\.#childProcess\.signalCode !== null\) return/)
  assert.doesNotMatch(shell, /if \(this\.#status !== 'running' && this\.#status !== 'backgrounded'\) return/)
  assert.match(shell, /await new Promise<void>\(\(resolve, reject\) => \{/)
  assert.match(shell, /treeKill\(pid, 'SIGKILL', error =>/)
  assert.match(shell, /finally \{\s*this\.#resolveExitCode\(SIGKILL\)/)
})

test('normal child exit and spawn error unregister cleanup; graceful shutdown waits for it', () => {
  const shell=read('src/utils/ShellCommand.ts')
  assert.match(shell, /childProcess\.once\('exit', unregister\)/)
  assert.match(shell, /childProcess\.once\('error', unregister\)/)
  const exit=read('src/utils/gracefulShutdown.ts')
  assert.match(exit, /await runCleanupFunctions\(\)/)
})
