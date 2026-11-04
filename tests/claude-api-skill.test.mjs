import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const root = resolve(import.meta.dirname, '..')

test('committed Claude API resources match the 2.1.317 official source manifest', () => {
  const result = execFileSync(process.execPath, [join(root, 'build/restore-claude-api.mjs'), '--verify'], { encoding: 'utf8' })
  assert.match(result, /Verified 107 committed Claude API 2\.1\.317 resources/)
})

test('the rebuilt CLI contains the target skill and version-migration guide', () => {
  const output = readFileSync(join(root, 'dist/cli.js'), 'utf8')
  assert.ok(output.includes('# Building LLM-Powered Applications with Claude'))
  assert.ok(output.includes('api-version-migration.md'))
  assert.ok(output.includes('Migrating to a newer Claude API version'))
})
