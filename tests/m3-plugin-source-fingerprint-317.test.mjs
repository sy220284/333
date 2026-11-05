import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { commandSourceTreeFingerprint } from '../src/utils/plugins/commandSourceFingerprint.mjs'

test('official 317 x64 command plugin version binds manifest version to exact file bytes', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pr7-command-fingerprint-'))
  try {
    mkdirSync(join(root, '.claude-plugin'), { recursive: true })
    writeFileSync(join(root, '.claude-plugin', 'plugin.json'),
      '{"name":"command-demo","version":"1.0.0","description":"command plugin"}')
    const hash = await commandSourceTreeFingerprint(root)
    assert.equal(hash.slice(0, 12), 'b6b4b8b1c2c1')
    assert.equal('1.0.0-' + hash.slice(0, 12), '1.0.0-b6b4b8b1c2c1')
    writeFileSync(join(root, 'added.txt'), 'This changes the plugin contents')
    assert.notEqual((await commandSourceTreeFingerprint(root)).slice(0, 12), hash.slice(0, 12))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
