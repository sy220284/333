import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, writeFile, readdir, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { discoverPluginTests317, MAX_PLUGIN_TEST_FILES_317 } from '../src/utils/plugins/pluginTestDiscovery317.mjs'

async function sandbox(fn) {
  const root = await mkdtemp(join(tmpdir(), 'plugin-test-317-'))
  try { await fn(root) }
  finally { await rm(root, { recursive: true, force: true }) }
}

test('2.1.317 plugin tests: recurse, sort and include only ts/tsx specs', () => sandbox(async root => {
  await mkdir(join(root, 'nested'))
  await writeFile(join(root, 'z.test.tsx'), '')
  await writeFile(join(root, 'nested', 'a.test.ts'), '')
  await writeFile(join(root, 'nested', 'b.test.tsx'), '')
  await writeFile(join(root, 'nested', 'skip.test.js'), '')
  await writeFile(join(root, 'nested', 'skip.test.mts'), '')
  const files = await discoverPluginTests317(root)
  assert.deepEqual(files, [
    join(root, 'nested', 'a.test.ts'),
    join(root, 'nested', 'b.test.tsx'),
    join(root, 'z.test.tsx'),
  ])
}))

test('2.1.317 plugin tests: hidden directories and node_modules are excluded', () => sandbox(async root => {
  await mkdir(join(root, 'node_modules', 'pkg'), { recursive: true })
  await mkdir(join(root, '.private'), { recursive: true })
  await mkdir(join(root, 'visible'), { recursive: true })
  for (const p of [
    join(root, 'node_modules', 'pkg', 'a.test.ts'),
    join(root, '.private', 'b.test.tsx'),
    join(root, 'visible', 'c.test.ts'),
  ]) await writeFile(p, '')
  assert.deepEqual(await discoverPluginTests317(root), [join(root, 'visible', 'c.test.ts')])
}))

test('2.1.317 plugin tests: too many files fails without silently truncating', () => sandbox(async root => {
  assert.equal(MAX_PLUGIN_TEST_FILES_317, 1000)
  await writeFile(join(root, 'a.test.ts'), '')
  await writeFile(join(root, 'b.test.ts'), '')
  await assert.rejects(discoverPluginTests317(root, { maxFiles: 1 }), /more than 1 test files/)
}))

test('2.1.317 plugin tests: symlinked folders are not traversed', () => sandbox(async root => {
  await mkdir(join(root, 'inside'))
  await writeFile(join(root, 'inside', 'real.test.ts'), '')
  try { await symlink(join(root, 'inside'), join(root, 'linked'), 'dir') }
  catch (error) {
    if (error.code === 'EPERM' || error.code === 'EACCES') return
    throw error
  }
  assert.deepEqual(await discoverPluginTests317(root), [join(root, 'inside', 'real.test.ts')])
}))
