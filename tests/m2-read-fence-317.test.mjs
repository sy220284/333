import assert from 'node:assert/strict'
import { test } from 'node:test'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

test('317 read exemptions accept absolute non-root local paths and reject unsafe declarations', async () => {
  const { normalizeReadExemptPaths } = await import('../src/utils/permissions/readFencePolicy.mjs')
  const safe = join(tmpdir(), 'approved-reads')
  assert.deepEqual(normalizeReadExemptPaths([safe, '/', '/.', '/tmp/../etc', 'relative', ' file ', '//host/share', '']), [safe])
})

test('317 enabling a read or write fence in any layer survives later false declarations', async () => {
  const { isFileFenceEnabled } = await import('../src/utils/permissions/readFencePolicy.mjs')
  const layers = [{ permissions: { blockReadsOutsideWorkingDirectories: true } }, { permissions: { blockReadsOutsideWorkingDirectories: false } }]
  assert.equal(isFileFenceEnabled(layers, 'read'), true)
  assert.equal(isFileFenceEnabled(layers, 'write'), false)
  assert.equal(isFileFenceEnabled([{ permissions: { blockWritesOutsideWorkingDirectories: true } }, {}], 'write'), true)
})

test('317 a project cannot expand the fenced directories through its own additionalDirectories', async () => {
  const { fileFenceContext } = await import('../src/utils/permissions/readFencePolicy.mjs')
  const directories = new Map([
    ['/untrusted', { path: '/untrusted', source: 'projectSettings' }],
    ['/approved', { path: '/approved', source: 'cliArg' }],
  ])
  assert.deepEqual([...fileFenceContext({ additionalWorkingDirectories: directories }).additionalWorkingDirectories.keys()], ['/approved'])
  assert.equal(directories.size, 2)
})
