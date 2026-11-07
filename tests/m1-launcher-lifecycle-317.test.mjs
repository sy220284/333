import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { test } from 'node:test'

const root = resolve(import.meta.dirname, '..')
const launcher = join(root, 'build/release-launcher.cjs')

function isolated(fn) {
  const dir = mkdtempSync(join(tmpdir(), '333-launcher-317-'))
  try {
    copyFileSync(launcher, join(dir, 'launcher.cjs'))
    writeFileSync(join(dir, 'cli.js'), '/* independent candidate CLI */')
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('M1 C19-T02: missing compiled executable exits explicitly with code 127', () => {
  isolated(dir => {
    const emptyPath = join(dir, 'empty-path')
    mkdirSync(emptyPath)
    const result = spawnSync(process.execPath, [join(dir, 'launcher.cjs'), '--version'], {
      cwd: dir, encoding: 'utf8', timeout: 5_000,
      env: { ...process.env, PATH: emptyPath, Path: emptyPath },
    })
    assert.equal(result.error, undefined, String(result.error))
    assert.equal(result.status, 127, result.stderr)
    assert.match(result.stderr, /ENOENT|spawn/)
  })
})

test('M1 C19-T02/T05: launcher preserves child exit status and arguments', {
  skip: process.platform === 'win32' && 'Unix executable stub required; Windows real Bun is tested by release-integrity',
}, () => {
  isolated(dir => {
    const bin = join(dir, 'bin')
    mkdirSync(bin)
    const stub = join(dir, 'yaoyaoche')
    writeFileSync(stub, '#!/usr/bin/env node\n' +
      'process.stdout.write(JSON.stringify(process.argv.slice(2)) + "\\n"); process.exit(37)\n')
    chmodSync(stub, 0o755)
    const result = spawnSync(process.execPath, [join(dir, 'launcher.cjs'), '--print', '汉字 with spaces'], {
      cwd: dir, encoding: 'utf8', timeout: 10_000,
      env: { ...process.env, PATH: bin + delimiter + process.env.PATH },
    })
    assert.equal(result.error, undefined, String(result.error))
    assert.equal(result.status, 37, result.stderr)
    assert.deepEqual(JSON.parse(result.stdout.trim()), ['--print', '汉字 with spaces'])
  })
})

test('M1 C19-T02/T05: terminating launcher forwards SIGTERM to child and waits for cleanup', {
  skip: process.platform === 'win32' && 'Windows does not provide POSIX SIGTERM lifecycle',
  timeout: 12_000,
}, async () => {
  const dir = mkdtempSync(join(tmpdir(), '333-launcher-signal-317-'))
  try {
    const bin = join(dir, 'bin')
    mkdirSync(bin)
    const stub = join(dir, 'yaoyaoche')
    const signalAck = join(dir, 'signal-ack')
    writeFileSync(stub, '#!/usr/bin/env node\n' +
      "const fs = require('node:fs');\n" +
      "process.on('SIGTERM', () => { fs.writeFileSync(process.env.STUB_ACK, 'clean'); process.exit(23) });\n" +
      "setInterval(() => {}, 1000); process.stdout.write('READY\\n');\n")
    chmodSync(stub, 0o755)
    copyFileSync(launcher, join(dir, 'launcher.cjs'))
    writeFileSync(join(dir, 'cli.js'), '/* stub */')
    const proc = spawn(process.execPath, [join(dir, 'launcher.cjs'), '--signal'], {
      cwd: dir, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PATH: bin + delimiter + process.env.PATH, STUB_ACK: signalAck },
    })
    let stdout = ''
    let stderr = ''
    proc.stdout.setEncoding('utf8')
    proc.stderr.setEncoding('utf8')
    proc.stderr.on('data', data => { stderr += data })
    let sent = false
    proc.stdout.on('data', data => {
      stdout += data
      if (!sent && stdout.includes('READY')) {
        sent = true
        proc.kill('SIGTERM')
      }
    })
    const { code, signal } = await new Promise((resolveResult, reject) => {
      const watchdog = setTimeout(() => { proc.kill('SIGKILL'); reject(new Error('Launcher did not terminate')) }, 9000)
      proc.on('error', error => { clearTimeout(watchdog); reject(error) })
      proc.on('close', (code, signal) => { clearTimeout(watchdog); resolveResult({ code, signal }) })
    })
    assert.equal(sent, true, 'Fake Bun never started')
    assert.equal(signal, null, 'Launcher must wait and exit with child status')
    assert.equal(code, 23, stderr)
    assert.equal(existsSync(signalAck), true, 'SIGTERM did not reach child')
    assert.equal(readFileSync(signalAck, 'utf8'), 'clean')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
