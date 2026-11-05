import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { discoverUnregisteredTests } from '../build/run-unregistered-tests.mjs'

test('new unregistered tests are automatically selected for execution', () => {
  const root = mkdtempSync(join(tmpdir(), '333-test-discovery-'))
  try {
    mkdirSync(join(root, 'tests', 'sub'), { recursive:true })
    mkdirSync(join(root, '.github', 'workflows'), { recursive:true })
    writeFileSync(join(root, 'package.json'), JSON.stringify({scripts: {test: 'node --test tests/already.test.mjs'}}))
    writeFileSync(join(root, '.github/workflows/test.yml'), 'run: bun test tests/ci.test.ts\n')
    for (const name of ['tests/already.test.mjs', 'tests/sub/new.test.mjs', 'tests/ci.test.ts']) {
      writeFileSync(join(root, name), '')
    }
    const found = discoverUnregisteredTests(root)
    assert.deepEqual(found.pending, ['tests/sub/new.test.mjs'])
    assert.equal(found.tests.length, 3)
    assert.equal(found.registered.length, 2)
    const workflowOnly = discoverUnregisteredTests(root, { workflowOnly: true })
    assert.deepEqual(workflowOnly.pending, ['tests/ci.test.ts'])
    assert.equal(workflowOnly.tests.length, 3)
  } finally {
    rmSync(root, { recursive:true, force:true })
  }
})
