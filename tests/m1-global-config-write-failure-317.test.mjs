import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { isUnrecoverableConfigWriteError } from '../src/utils/sessionWriteFailurePolicy.mjs'

test('2.1.317 config disk, quota and read-only failures must reach CLI', () => {
  for (const code of ['ENOSPC', 'EDQUOT', 'EROFS', 'EIO', 'EACCES', 'EPERM']) {
    assert.equal(isUnrecoverableConfigWriteError(code), true, code)
  }
})

test('only recoverable lock or transient state continues the fallback path', () => {
  for (const code of [undefined, 'EEXIST', 'EBUSY', 'ENOENT', 'EAGAIN']) {
    assert.equal(isUnrecoverableConfigWriteError(code), false, String(code))
  }
})

test('global and project config preserve terminal write errors before fallback', () => {
  const config = readFileSync(new URL('../src/utils/config.ts', import.meta.url), 'utf8')
  const global = config.slice(config.indexOf('export function saveGlobalConfig('))
  const project = config.slice(config.indexOf('export function saveCurrentProjectConfig('))
  assert.match(global, /if \(isUnrecoverableConfigWriteError\(getErrnoCode\(error\)\)\) throw error/)
  assert.match(project, /if \(isUnrecoverableConfigWriteError\(getErrnoCode\(error\)\)\) throw error/)
  assert.ok(global.indexOf('isUnrecoverableConfigWriteError(') < global.indexOf('saveGlobalConfig fallback:'))
  assert.ok(project.indexOf('isUnrecoverableConfigWriteError(') < project.indexOf('saveCurrentProjectConfig fallback:'))
})
