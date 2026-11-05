import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const cli = resolve(import.meta.dirname, '../dist/cli.js')
const standalone = resolve(import.meta.dirname, '../dist', process.platform === 'win32' ? 'claude.exe' : 'claude')
const nativeRuntimeMode = process.env.M1_NATIVE_BINARY_RUN === '1'
const id = '11111111-1111-4111-8111-111111111111'
const model = 'claude-sonnet-4-6'
function launch(args, env) {
  return new Promise((done, fail) => {
    const child = spawn(nativeRuntimeMode ? standalone : 'bun', nativeRuntimeMode ? args : [cli, ...args], { env, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = '', stderr = ''
    const timeout = setTimeout(() => child.kill('SIGKILL'), 25_000)
    child.stdout.on('data', data => { stdout += data }); child.stderr.on('data', data => { stderr += data })
    child.on('error', error => { clearTimeout(timeout); fail(error) })
    child.on('close', (status, signal) => { clearTimeout(timeout); done({ status, signal, stdout, stderr }) })
  })
}
test('deep-link argument injection is rejected before configuration side effects', () => {
  const home = mkdtempSync(join(tmpdir(), '333-deep-link-'))
  try {
    const result = spawnSync('bun', [cli, '--handle-uri', 'claude://open', '--settings', 'malicious'], { encoding: 'utf8', timeout: 5000, env: { ...process.env, CLAUDE_CONFIG_DIR: home } })
    assert.ifError(result.error); assert.equal(result.status, 1); assert.match(result.stderr, /argument injection/)
    assert.equal(existsSync(join(home, '.claude.json')), false)
  } finally { rmSync(home, { recursive: true, force: true }) }
})

test('333 在无界面启动入口拒绝 print、JSON、stream-json 和 SDK 传输', async () => {
  const home = mkdtempSync(join(tmpdir(), '333-interactive-only-'))
  try {
    const env = { ...process.env, CLAUDE_CONFIG_DIR: home, DISABLE_TELEMETRY: '1',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', CI: 'true', NO_COLOR: '1' }
    for (const args of [
      ['-p', 'hello'],
      ['--print', '--output-format', 'json', 'hello'],
      ['--print', '--output-format', 'stream-json', 'hello'],
      ['--sdk-url', 'ws://127.0.0.1:3000', 'hello'],
      ['--print', '--model', 'claude-sonnet-4-6', 'hello'],
      ['--print', '--settings', '{"model":"claude-sonnet-4-6"}', 'hello'],
    ]) {
      const result = await launch(args, env)
      assert.equal(result.status, 2, JSON.stringify({ args, result }))
      assert.equal(result.stdout, '')
      assert.match(result.stderr, /333 已移除非交互模式/, args.join(' '))
    }
    assert.equal(existsSync(join(home, '.claude.json')), false)
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('official desktop/background conflict fails before loading Desktop or interactive CLI', () => {
  const cases = [
    { args: ['--desktop', '--bg'], message: "--desktop opens the Claude Desktop app and can't run in the background" },
    { args: ['--desktop', '--background'], message: "--desktop opens the Claude Desktop app and can't run in the background" },
    { args: ['--desktop', 'logs', 'deadbeef'], message: "--desktop can't be combined with \`claude logs\`." },
    { args: ['--settings={}', '--desktop', 'stop', 'deadbeef'], message: "--desktop can't be combined with \`claude stop\`." },
  ]
  const targets = [['rebuilt', process.execPath, [cli]]]
  if (process.env.CLAUDE_TARGET_X64) targets.push(['official', process.env.CLAUDE_TARGET_X64, []])
  for (const [label, bin, prefix] of targets) {
    // Under the rebuild test suite process.execPath points to Node; use Bun for the bundled CLI.
    const executable = label === 'rebuilt' ? 'bun' : bin
    for (const { args, message } of cases) {
      const result = spawnSync(executable, [...prefix, ...args], {
        cwd: resolve(import.meta.dirname, '..'), encoding: 'utf8', timeout: 12_000,
        env: { ...process.env, DISABLE_TELEMETRY: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' },
      })
      assert.ifError(result.error)
      assert.equal(result.status, 1, label + ' ' + JSON.stringify(result))
      assert.ok(result.stderr.includes(message), label + ' ' + result.stderr)
    }
  }
})
