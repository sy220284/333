import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'

const cli = resolve('dist/cli.js')
function fixture(testCode, hookCode = 'export function register(on) {}') {
  const dir = mkdtempSync(join(tmpdir(), 'plugin-test-runner-317-'))
  const plugin = join(dir, 'plugin')
  mkdirSync(join(plugin, '.claude-plugin'), { recursive: true })
  mkdirSync(join(plugin, 'hooks'), { recursive: true })
  mkdirSync(join(dir, 'config'), { recursive: true })
  writeFileSync(join(plugin, '.claude-plugin', 'plugin.json'), '{"name":"demo-test-plugin"}\n')
  writeFileSync(join(plugin, 'hooks', 'hooks.json'), '{"modules":["./register.js"]}\n')
  writeFileSync(join(plugin, 'hooks', 'register.js'), hookCode)
  writeFileSync(join(plugin, 'basic.test.ts'), testCode)
  return { dir, plugin }
}
function execute(fixture, args = []) {
  return spawnSync('bun', [cli, 'plugin', 'test', ...args, fixture.plugin], {
    cwd: fixture.plugin,
    encoding: 'utf8',
    env: {
      ...process.env, CLAUDE_CONFIG_DIR: join(fixture.dir, 'config'),
      DISABLE_TELEMETRY: '1', DISABLE_ERROR_REPORTING: '1',
    },
    timeout: 30000,
  })
}
function run(testCode, validate, hookCode) {
  const data = fixture(testCode, hookCode)
  try {
    const result = execute(data)
    assert.equal(result.error, undefined, result.error?.message)
    validate(result)
  } finally {
    rmSync(data.dir, { recursive: true, force: true })
  }
}

test('317 plugin test: isolated child executes real test body and reports pass', () => run(
  `import { test, expect } from 'claude-code/testing'
test('basic true', () => { expect(1).toBe(1) })`,
  result => {
    assert.equal(result.status, 0, result.stderr + '\n' + result.stdout)
    assert.match(result.stdout, /\(pass\) basic true/)
    assert.match(result.stdout, /1 pass/)
    assert.match(result.stdout, /0 fail/)
  },
))

test('317 plugin test: failed expectation returns nonzero and is reported', () => run(
  `import { test, expect } from 'claude-code/testing'
test('actually false', () => { expect(1).toBe(2) })`,
  result => {
    assert.equal(result.status, 1, result.stderr + '\n' + result.stdout)
    assert.match(result.stdout, /\(fail\) actually false/)
    assert.match(result.stdout, /1 fail/)
  },
))

test('317 plugin test: nested describe, TS/TSX, async bodies, hooks are loaded', () => run(
  `import { test, describe, expect } from 'claude-code/testing'
describe('outer', () => { test('async emitter', async ($) => {
  expect(await $.emit('SessionStart', { hello: true })).toEqual([{ ok: true }])
}) })`,
  result => {
    assert.equal(result.status, 0, result.stderr + '\n' + result.stdout)
    assert.match(result.stdout, /outer/)
    assert.match(result.stdout, /async emitter/)
  },
  `export function register(on) { on('SessionStart', event => ({ok:event.hello})) }`,
))

test('317 plugin test: missing Hooks module is rejected like official x64', () => {
  const data = fixture(`import { test } from 'claude-code/testing'; test('x', () => {})`)
  try {
    writeFileSync(join(data.plugin, 'hooks', 'hooks.json'), '{"modules":[]}\n')
    const result = execute(data)
    assert.equal(result.status, 1, result.stdout + result.stderr)
    assert.match(result.stderr, /no hooks module to load/)
  } finally { rmSync(data.dir, { recursive: true, force: true }) }
})

test('317 plugin test: no *.test.ts files has nonzero exit code', () => {
  const data = fixture('export const notATest = true')
  try {
    // This spec itself contains no test(), which must count as a failure.
    const result = execute(data)
    assert.equal(result.status, 1, result.stdout + result.stderr)
    assert.match(result.stdout, /no test\(\)/)
  } finally { rmSync(data.dir, { recursive: true, force: true }) }
})
