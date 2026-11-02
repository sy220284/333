import { test, expect } from 'bun:test'
import { spawn } from 'node:child_process'
import { connect } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sendToUdsSocket } from '../src/utils/udsClient.js'

test('real cross-process UDS message is accepted and reaches receiver queue', async () => {
  if (process.platform === 'win32') return
  const dir = await mkdtemp(join(tmpdir(), 'm1-uds-e2e-'))
  const socketPath = join(dir, 'peer.sock')
  const child = spawn(process.execPath, [join(import.meta.dir, 'fixtures/m1-uds-receiver.ts'), socketPath], { stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  let stderr = ''
  let onOutput = () => {}
  child.stdout.on('data', chunk => { output += String(chunk); onOutput() })
  child.stderr.on('data', chunk => { stderr += String(chunk); onOutput() })
  child.once('exit', () => onOutput())
  function waitFor(marker: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Timeout ${marker}; ${output}; ${stderr}`)), 15000)
      onOutput = () => {
        if (output.includes(marker)) { clearTimeout(timeout); resolve() }
        else if (child.exitCode !== null) { clearTimeout(timeout); reject(new Error(`Receiver exited ${child.exitCode}: ${stderr}`)) }
      }
      onOutput()
    })
  }
  try {
    await waitFor('READY')
    const receipt = await new Promise<string>((resolve, reject) => {
      const client = connect(socketPath)
      let response = ''
      client.setTimeout(5000)
      client.once('connect', () => client.write('invalid-json\n'))
      client.on('data', chunk => {
        response += String(chunk)
        if (response.includes('\n')) { client.end(); resolve(response.trim()) }
      })
      client.once('error', reject)
      client.once('timeout', () => reject(new Error('Malformed message did not receive rejection')))
    })
    expect(receipt).toBe('ERR json')
    await sendToUdsSocket(socketPath, 'cross-process-hello')
    await waitFor('DELIVERED')
  } finally {
    if (child.exitCode === null) child.kill()
    await rm(dir, { recursive: true, force: true })
  }
}, 40000)
