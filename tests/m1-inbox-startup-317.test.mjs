import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '..')

test('317 automatic inbox failure leaves CLI startup usable and never advertises a socket', () => {
  const home = mkdtempSync(join(tmpdir(), '333-inbox-'))
  const blocked = join(home, 'file')
  writeFileSync(blocked, 'not a directory')
  try {
    const result = spawnSync('bun', ['-e', `
      import assert from 'node:assert/strict'
      import * as inbox from './src/utils/udsMessaging.ts'
      process.env.TMPDIR = ${JSON.stringify(blocked)}
      assert.equal(typeof inbox.startCrossSessionInbox, 'function')
      assert.equal(await inbox.startCrossSessionInbox(), false)
      assert.equal(inbox.getMessagingSocketPath(), undefined)
      assert.equal(process.env.CLAUDE_CODE_MESSAGING_SOCKET, undefined)
      assert.equal(inbox.getUdsStartFailureCause(), 'bind_failed')
    `], { cwd: root, encoding: 'utf8', timeout: 10000 })
    assert.equal(result.status, 0, result.stderr)
  } finally { rmSync(home, { recursive: true, force: true }) }
})

test('317 explicitly requested inbox failure stays actionable and rejects startup', () => {
  const home = mkdtempSync(join(tmpdir(), '333-inbox-'))
  const blocked = join(home, 'file')
  writeFileSync(blocked, 'not a directory')
  try {
    const result = spawnSync('bun', ['-e', `
      import assert from 'node:assert/strict'
      import * as inbox from './src/utils/udsMessaging.ts'
      assert.equal(typeof inbox.startCrossSessionInbox, 'function')
      await assert.rejects(inbox.startCrossSessionInbox(${JSON.stringify(join(blocked, 'inbox.sock'))}), /--messaging-socket-path/)
      assert.equal(inbox.getMessagingSocketPath(), undefined)
      assert.equal(inbox.getUdsStartFailureCause(), 'bind_failed')
    `], { cwd: root, encoding: 'utf8', timeout: 10000 })
    assert.equal(result.status, 0, result.stderr)
  } finally { rmSync(home, { recursive: true, force: true }) }
})
