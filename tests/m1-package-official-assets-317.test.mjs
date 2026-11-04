import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { packageOfficialEmbeddedAssets317 } from '../build/package-official-317-assets.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MANIFEST_PATH = 'build/official-embedded-assets-2.1.317.json'
const MANIFEST = JSON.parse(readFileSync(join(ROOT, MANIFEST_PATH), 'utf8'))

test('official 317 distribution: all 101 original resources ship with exact bytes', () => {
  const dist = mkdtempSync(join(tmpdir(), 'official-317-release-'))
  try {
    const result = packageOfficialEmbeddedAssets317(ROOT, dist)
    assert.equal(result.resourceCount, 101)
    assert.deepEqual(readFileSync(join(dist, 'official-317/manifest.json')),
      readFileSync(join(ROOT, MANIFEST_PATH)))
    for (const asset of MANIFEST.resources) {
      const published = join(dist, 'official-317', asset.path.slice(4))
      const data = readFileSync(published)
      assert.equal(data.length, asset.bytes, asset.path)
      assert.equal(createHash('sha256').update(data).digest('hex'), asset.sha256, asset.path)
    }
    const first = join(dist, 'official-317', MANIFEST.resources[0].path.slice(4))
    writeFileSync(first, 'corrupt release file')
    packageOfficialEmbeddedAssets317(ROOT, dist)
    assert.equal(createHash('sha256').update(readFileSync(first)).digest('hex'),
      MANIFEST.resources[0].sha256)
  } finally {
    rmSync(dist, { recursive: true, force: true })
  }
})

test('official 317 distribution: corrupted source is rejected before modifying prior release', () => {
  const temp = mkdtempSync(join(tmpdir(), 'official-317-invalid-'))
  try {
    const root = join(temp, 'source')
    const dist = join(temp, 'dist')
    mkdirSync(join(root, 'build'), { recursive: true })
    mkdirSync(dist)
    writeFileSync(join(root, 'package.json'), '{"version":"2.1.317"}')
    copyFileSync(join(ROOT, MANIFEST_PATH), join(root, MANIFEST_PATH))
    for (const asset of MANIFEST.resources) {
      const to = join(root, asset.path)
      mkdirSync(dirname(to), { recursive: true })
      copyFileSync(join(ROOT, asset.path), to)
    }
    packageOfficialEmbeddedAssets317(root, dist)
    const old = join(dist, 'official-317', MANIFEST.resources[0].path.slice(4))
    const preserved = readFileSync(old)
    writeFileSync(join(root, MANIFEST.resources[0].path), 'tampered original')
    assert.throws(() => packageOfficialEmbeddedAssets317(root, dist), /bytes differ/)
    assert.ok(existsSync(old))
    assert.deepEqual(readFileSync(old), preserved)
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
})
