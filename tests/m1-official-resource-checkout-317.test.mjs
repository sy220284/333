import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { verifyOfficialEmbeddedAssets317 } from '../build/verify-official-embedded-assets.mjs'

const root = resolve(import.meta.dirname, '..')
const manifest = JSON.parse(
  readFileSync(resolve(root, 'build/official-embedded-assets-2.1.317.json'), 'utf8'),
)

test('2.1.317 official resources survive platform checkout without line-ending filters', () => {
  assert.equal(manifest.resources.length, 101)
  const paths = manifest.resources.map(item => item.path)
  const child = spawnSync('git', ['check-attr', '-z', 'text', '--', ...paths], {
    cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024,
  })
  assert.equal(child.error, undefined, child.error?.message)
  assert.equal(child.status, 0, child.stderr)
  const result = child.stdout.split('\0')
  result.pop()
  assert.equal(result.length, paths.length * 3)
  for (let i = 0; i < paths.length; i++) {
    assert.equal(result[i * 3], paths[i])
    assert.equal(result[i * 3 + 1], 'text')
    assert.equal(result[i * 3 + 2], 'unset',
      'Pinned 2.1.317 resource must preserve exact upstream bytes: ' + paths[i])
  }
})

test('2.1.317 official embedded resources match every source hash after checkout', () => {
  const verified = verifyOfficialEmbeddedAssets317(root)
  assert.equal(verified.verified, true)
  assert.equal(verified.resourceCount, 101)
})
