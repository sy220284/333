#!/usr/bin/env node
'use strict'

// M1 C19-T02/T05: launcher must keep handling termination while the
// Bun-built CLI is running. A synchronous child blocks signal forwarding.
const { spawn } = require('node:child_process')
const { constants } = require('node:os')
const { join } = require('node:path')

const child = spawn('bun', [join(__dirname, 'cli.js'), ...process.argv.slice(2)], {
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
