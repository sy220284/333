/** Standalone local desktop host. stdout carries protocol JSON only. */
import { resolve } from 'node:path'
import { serveDesktopStdio } from '../services/desktop/stdio.js'
import type { DesktopGatewayOptions } from '../services/desktop/gateway.js'

const options: DesktopGatewayOptions = { cwd: process.cwd() }
const argv = process.argv.slice(2)
for (let index = 0; index < argv.length; index++) {
  const key = argv[index]
  if (key !== '--cwd' && key !== '--model' && key !== '--data-dir' && key !== '--cli') {
    throw new TypeError('Unknown desktop host option: ' + key)
  }
  const value = argv[++index]
  if (!value) throw new TypeError('Missing desktop host option value for ' + key)
  if (key === '--cwd') options.cwd = resolve(value)
  if (key === '--model') options.model = value
  if (key === '--data-dir') options.dataDir = resolve(value)
  if (key === '--cli') options.sessionOptions = { ...options.sessionOptions, pathToClaudeCodeExecutable: resolve(value) }
}

await serveDesktopStdio(process.stdin, process.stdout, options)
