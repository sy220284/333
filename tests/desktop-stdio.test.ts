import { test, expect } from 'bun:test'
import { PassThrough } from 'node:stream'
import { serveDesktopStdio } from '../src/services/desktop/stdio.js'

test('desktop stdio transport returns correlated JSON Lines and rejects bad input', async () => {
  const input = new PassThrough()
  const output = new PassThrough()
  let stdout = ''
  output.on('data', chunk => { stdout += chunk.toString() })
  const active = serveDesktopStdio(input, output)
  input.write('{"id":"greeting","method":"hello"}\n')
  input.write('{"id":"unknown","method":"unregistered"}\n')
  input.write('not-json\n')
  input.end()
  await active
  const frames = stdout.trim().split('\n').map(line => JSON.parse(line)) as Array<{
    id: string | null; ok: boolean; result?: { protocolVersion: number };
    error?: { code: string }
  }>
  const first = frames.find(frame => frame.id === 'greeting')
  expect(first?.ok).toBe(true)
  expect(first?.result?.protocolVersion).toBe(1)
  expect(frames.find(frame => frame.id === 'unknown')?.error?.code).toBe('INVALID_REQUEST')
  expect(frames.find(frame => frame.id === null)?.error?.code).toBe('INVALID_REQUEST')
})
