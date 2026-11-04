import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'

const root = resolve(import.meta.dirname, '..')
const manifest = JSON.parse(readFileSync(join(root, 'build/standalone-bundled-assets-2.1.317.json'), 'utf8'))
const script = 'build/verify-bundled-assets.mjs'
const targetPath = 'docs/upgrade/m1-evidence/target-release.json'

function check(base) {
  return spawnSync(process.execPath, [join(base, script)], {
    cwd: base, encoding: 'utf8', timeout: 20_000,
  })
}

function fixture(fn) {
  const home = mkdtempSync(join(tmpdir(), '333-bundled-317-'))
  try {
    for (const path of [script, targetPath, 'build/standalone-bundled-assets-2.1.317.json', ...manifest.resources.map(x => x.path)]) {
      const destination = join(home, path)
      mkdirSync(dirname(destination), { recursive: true })
      copyFileSync(join(root, path), destination)
    }
    fn(home)
  } finally { rmSync(home, { recursive: true, force: true }) }
}

test('317 standalone bundled resources have a unique official pinned identity', () => {
  assert.equal(manifest.version, '2.1.317')
  assert.equal(manifest.resources.length, 6)
  assert.equal(new Set(manifest.resources.map(r => r.path)).size, 6)
  const result = check(root)
  assert.equal(result.error, undefined, result.error?.message)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /Verified 6 standalone bundled asset hashes against 2\\.1\\.317/)
})

test('317 standalone verifier rejects changed asset bytes', () => fixture(home => {
  const path = join(home, manifest.resources[0].path)
  writeFileSync(path, readFileSync(path, 'utf8') + '\nALTERED\n')
  const result = check(home)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /checksum mismatch/i)
}))

test('317 standalone verifier rejects a symlink where a regular asset is required', () => fixture(home => {
  const path = join(home, manifest.resources[0].path)
  rmSync(path)
  symlinkSync(join(home, manifest.resources[1].path), path)
  const result = check(home)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /regular file/i)
}))

test('317 standalone verifier rejects missing target manifest', () => fixture(home => {
  writeFileSync(join(home, targetPath), JSON.stringify({ target_version: '2.1.318' }))
  const result = check(home)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /ENOENT|no such file/i)
}))
