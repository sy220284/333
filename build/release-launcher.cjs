#!/usr/bin/env node
'use strict'

// M1 C19-T02/T05: the distributed entrypoint launches the self-contained
// native program, with no external Bun runtime. Forward signals and preserve
// the native process exit status.
const { spawn } = require('node:child_process')
const { constants } = require('node:os')
const { join } = require('node:path')

const nativeCli = join(__dirname, process.platform === 'win32' ? 'qerivon.exe' : 'qerivon')
const child = spawn(nativeCli, process.argv.slice(2), {
  stdio: 'inherit',
  env: process.env,
  windowsHide: true,
})

let settled = false
function terminate(signal) {
  if (!settled && child.exitCode === null && child.signalCode === null) {
    child.kill(signal)
  }
}
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => terminate(signal))
}
child.once('error', error => {
  if (settled) return
  settled = true
  console.error(error.message)
  process.exitCode = error.code === 'ENOENT' ? 127 : 1
})
child.once('close', (code, signal) => {
  if (settled) return
  settled = true
  if (signal) {
    process.exitCode = 128 + (constants.signals[signal] || 1)
  } else {
    process.exitCode = code ?? 1
  }
})
