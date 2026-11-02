import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { extractBundleAtomically } from '../src/skills/bundledFiles.mjs'

test('a failed partial extraction leaves no published directory and can be retried', async () => {
  const parent = mkdtempSync(join(tmpdir(), '333-skill-extraction-'))
  const dir = join(parent, 'skill')
  try {
    await assert.rejects(extractBundleAtomically(dir, {
      'one.txt': 'first', conflict: 'file', 'conflict/child.txt': 'child',
    }))
    assert.equal(existsSync(dir), false)
    await extractBundleAtomically(dir, { 'one.txt': 'second', 'conflict/child.txt': 'child' })
    assert.equal(readFileSync(join(dir, 'one.txt'), 'utf8'), 'second')
    assert.equal(readFileSync(join(dir, 'conflict/child.txt'), 'utf8'), 'child')
  } finally {
    rmSync(parent, { recursive: true, force: true })
  }
})

test('skill resources cannot escape their extraction directory', async () => {
  const parent = mkdtempSync(join(tmpdir(), '333-skill-path-'))
  try {
    await assert.rejects(extractBundleAtomically(join(parent, 'skill'), { '../outside.txt': 'bad' }), /escapes/)
    assert.equal(existsSync(join(parent, 'outside.txt')), false)
  } finally {
    rmSync(parent, { recursive: true, force: true })
  }
})
