import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const target = process.env.CLAUDE_TARGET_X64
const rebuilt = join(root, 'dist/cli.js')

test('333 independently rebuilt CLI matches 317 upstream version and verbose version', () => {
  assert.ok(target, 'CLAUDE_TARGET_X64 must be supplied from a hash-verified 317 release')
  for (const args of [['--version'], ['--version','--verbose'], ['-v','--verbose']]) {
    const env = { ...process.env, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' }
    const official = spawnSync(target,args,{env,encoding:'utf8',timeout:10000})
    const actual = spawnSync('bun',[rebuilt,...args],{env,encoding:'utf8',timeout:10000})
    assert.equal(official.status,0,official.stderr)
    assert.equal(actual.status,0,actual.stderr)
    assert.equal(actual.stdout,official.stdout,JSON.stringify({args,expected:official.stdout,actual:actual.stdout}))
  }
})
