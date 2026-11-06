import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const repoRoot = resolve(import.meta.dirname, '..')
const binaries = [['rebuilt', 'bun', [join(repoRoot, 'dist/cli.js')]]]
if (process.env.CLAUDE_TARGET_X64) binaries.push(['official', process.env.CLAUDE_TARGET_X64, []])

test('2.1.317 plugin install --marketplace/--json: real local source, idempotency and failures', { timeout: 180_000 }, async () => {
  for (const [version, executable, prefix] of binaries) {
    const root = mkdtempSync(join(tmpdir(), '333-install-json-317-'))
    const home = join(root, 'home')
    const marketplace = join(root, 'marketplace')
    mkdirSync(home, { recursive: true })
    mkdirSync(join(marketplace, '.claude-plugin'), { recursive: true })
    mkdirSync(join(marketplace, 'demo', '.claude-plugin'), { recursive: true })
    writeFileSync(join(marketplace, '.claude-plugin', 'marketplace.json'), JSON.stringify({
      name: 'm1-install-json',
      owner: { name: 'M1 Fixture' },
      plugins: [{ name: 'demo', source: './demo', description: 'isolated test plugin' }],
    }))
    writeFileSync(join(marketplace, 'demo', '.claude-plugin', 'plugin.json'), JSON.stringify({
      name: 'demo',
      version: '1.0.0',
      description: 'isolated test plugin',
      userConfig: {
        mode: { type: 'string', title: 'Mode', description: 'Execution mode' },
        token: { type: 'string', title: 'Token', description: 'Secret token', required: true, sensitive: true },
      },
    }))
    const env = {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      CLAUDE_CONFIG_DIR: join(home, '.claude'),
      XDG_CONFIG_HOME: join(home, '.config'),
      DISABLE_AUTOUPDATER: '1',
      DISABLE_TELEMETRY: '1',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      NO_COLOR: '1',
      CI: '1',
    }
    for (const key of Object.keys(env)) if (key.startsWith('ANTHROPIC_')) delete env[key]
    const run = args => new Promise((resolve, reject) => {
      const child = spawn(executable, [...prefix, ...args], {
        cwd: home, env, stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true, detached: process.platform !== 'win32',
      })
      let stdout = ''
      let stderr = ''
      let timedOut = false
      child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk })
      child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk })
      const timeout = setTimeout(() => {
        timedOut = true
        // Kill the whole process group: grandchildren may hold stdout pipes.
        if (process.platform !== 'win32' && child.pid) {
          try { process.kill(-child.pid, 'SIGKILL') }
          catch (error) {
            if (error.code !== 'ESRCH') reject(error)
          }
        } else child.kill('SIGKILL')
      }, 25_000)
      child.once('error', error => {
        clearTimeout(timeout)
        reject(error)
      })
      child.once('close', (status, signal) => {
        clearTimeout(timeout)
        if (timedOut) {
          reject(new Error(`Plugin CLI exceeded 25s: ${JSON.stringify(args)}; signal=${signal}; stderr=${stderr.slice(-1500)}`))
          return
        }
        resolve({ status, stdout, stderr })
      })
    })
    const readJsonLine = process => {
      const lines = process.stdout.trim().split(/\r?\n/)
      assert.equal(lines.length, 1, `${version}: expected one JSON line: ${process.stdout}`)
      return JSON.parse(lines[0])
    }
    try {
      const first = await run(['plugin', 'install', 'demo', '--marketplace', marketplace, '--config', 'mode=fast', '--config', 'token=secret-probe', '--registry', 'https://registry.example.test', '--json'])
      assert.equal(first.status, 0, `${version}: ${first.stderr}`)
      const created = readJsonLine(first)
      assert.equal(created.command, 'install')
      assert.equal(created.outcome, 'ok')
      assert.equal(created.pluginId, 'demo@m1-install-json')
      assert.equal(created.configApplied, true)
      const source = readFileSync(new URL('../src/services/plugins/pluginOperations.ts', import.meta.url), 'utf8')
      assert.match(source, /foundPlugin\.source\.source === 'npm'/)
      assert.match(source, /registry: npmRegistry/)
      const settingsFile = join(home, '.claude', 'settings.json')
      const settings = JSON.parse(readFileSync(settingsFile, 'utf8'))
      assert.equal(settings.pluginConfigs['demo@m1-install-json'].options.mode, 'fast')
      assert.ok(!readFileSync(settingsFile, 'utf8').includes('secret-probe'))
      const configured = await run(['plugin', 'configure', 'demo@m1-install-json', '--json'])
      assert.equal(configured.status, 0, `${version}: ${configured.stderr}`)
      const fields = JSON.parse(configured.stdout)
      assert.ok(fields.configured.includes('token'))
      assert.equal(fields.inputs.token, '')

      const second = await run(['plugin', 'install', 'demo', '--marketplace', marketplace, '--config', 'mode=slow', '--json'])
      assert.equal(second.status, 0, `${version}: ${second.stderr}`)
      const repeated = readJsonLine(second)
      assert.equal(repeated.pluginId, 'demo@m1-install-json')
      assert.match(repeated.message, /already installed/)
      assert.equal(repeated.installedVersion, '1.0.0')
      assert.equal(repeated.availableVersion, '1.0.0')
      assert.equal(repeated.configApplied, true)
      assert.equal(JSON.parse(readFileSync(settingsFile, 'utf8')).pluginConfigs['demo@m1-install-json'].options.mode, 'slow')

      const rejected = await run(['plugin', 'install', 'demo@m1-install-json', '--config', 'nonexistent=secret-probe', '--json'])
      assert.equal(rejected.status, 0, `${version}: ${rejected.stderr}`)
      const refused = readJsonLine(rejected)
      assert.equal(refused.configApplied, false)
      assert.ok(refused.message.includes('not applied'))
      assert.ok(!rejected.stdout.includes('secret-probe'))
      assert.equal(JSON.parse(readFileSync(settingsFile, 'utf8')).pluginConfigs['demo@m1-install-json'].options.mode, 'slow')

      const missing = await run(['plugin', 'install', 'missing@m1-install-json', '--json'])
      assert.notEqual(missing.status, 0)
      const error = readJsonLine(missing)
      assert.equal(error.outcome, 'failed')
      assert.equal(error.failureCode, 'not_found')
      assert.equal(error.plugin, 'missing@m1-install-json')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
})
