import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('top-level CLI catches initialization failures instead of ignoring rejected main()', () => {
  const source = readFileSync(new URL('../src/entrypoints/cli.tsx', import.meta.url),'utf8')
  assert.match(source, /void main\(\)\.catch\(reportCliStartupFailure\)/)
  assert.doesNotMatch(source, /\bvoid main\(\);/)
})

test('a headless startup rejection prints the actual error and exits nonzero', () => {
  const file = new URL('../src/utils/cliStartupFailure.mjs', import.meta.url)
  const code = `import {reportCliStartupFailure} from ${JSON.stringify(file.href)}; reportCliStartupFailure(new Error('boot failure'))`
  const result = spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8',timeout:5000})
  assert.equal(result.status,1)
  assert.match(result.stderr,/Error: boot failure/)
  assert.equal(result.stdout,'')
})

test('non-error startup exceptions still exit 1 with a readable diagnostic', () => {
  const file = new URL('../src/utils/cliStartupFailure.mjs', import.meta.url)
  const code = `import {reportCliStartupFailure} from ${JSON.stringify(file.href)}; reportCliStartupFailure('invalid setting')`
  const result = spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8',timeout:5000})
  assert.equal(result.status,1)
  assert.match(result.stderr,/invalid setting/)
})
