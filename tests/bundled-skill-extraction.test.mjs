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

test('bundled skill files remain available after a second process or a newer release', async () => {
  const parent = mkdtempSync(join(tmpdir(), '333-skill-restart-'))
  const dir = join(parent, 'skill')
  try {
    await extractBundleAtomically(dir, { 'SKILL.md': 'version one', 'docs/a.md': 'reference one' })
    await extractBundleAtomically(dir, { 'SKILL.md': 'version one', 'docs/a.md': 'reference one' })
    assert.equal(readFileSync(join(dir, 'SKILL.md'), 'utf8'), 'version one')
    await extractBundleAtomically(dir, { 'SKILL.md': 'version two', 'docs/b.md': 'reference two' })
    assert.equal(readFileSync(join(dir, 'SKILL.md'), 'utf8'), 'version two')
    assert.equal(readFileSync(join(dir, 'docs/b.md'), 'utf8'), 'reference two')
    assert.equal(existsSync(join(dir, 'docs/a.md')), false)
  } finally {
    rmSync(parent, { recursive: true, force: true })
  }
})

test('a failed upgrade preserves the full previously installed skill bundle', async () => {
  const parent = mkdtempSync(join(tmpdir(), '333-skill-rollback-'))
  const dir = join(parent, 'skill')
  try {
    await extractBundleAtomically(dir, { 'SKILL.md': 'safe original', 'docs/a.md': 'original reference' })
    await assert.rejects(extractBundleAtomically(dir, {
      'SKILL.md': 'bad upgrade', conflict: 'file', 'conflict/child.md': 'invalid',
    }))
    assert.equal(readFileSync(join(dir, 'SKILL.md'), 'utf8'), 'safe original')
    assert.equal(readFileSync(join(dir, 'docs/a.md'), 'utf8'), 'original reference')
  } finally {
    rmSync(parent, { recursive: true, force: true })
  }
})
