import { expect, test } from 'bun:test'
import { PassThrough } from 'node:stream'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createProjectBudget } from '../src/services/agentCenter/projectBudget.js'
import { createDesktopClient } from '../src/services/desktop/client.js'
import { serveDesktopStdio } from '../src/services/desktop/stdio.js'

test('typed desktop client correlates concurrent replies and handles protocol errors', async () => {
  const toServer = new PassThrough()
  const fromServer = new PassThrough()
  const serving = serveDesktopStdio(toServer, fromServer)
  const client = createDesktopClient(fromServer, toServer)
  const [hello, second] = await Promise.all([client.hello(), client.hello()])
  expect(hello.protocolVersion).toBe(1)
  expect(second.capabilities).toContain('permissions')
  await expect(client.invoke({ method: 'sessions.status', sessionId: '00000000-0000-4000-8000-000000000000' }))
    .rejects.toThrow('REQUEST_FAILED')
  client.close()
  toServer.end()
  await serving
})

test('typed desktop client rejects outstanding requests when its host disconnects', async () => {
  const fromServer = new PassThrough()
  const toServer = new PassThrough()
  const client = createDesktopClient(fromServer, toServer)
  const pending = client.hello()
  fromServer.end()
  await expect(pending).rejects.toThrow('disconnected')
  client.close()
  toServer.end()
})

test('桌面客户端经 JSONL 传输核销实际未知费用记录，并释放预占', async () => {
  const root = await mkdtemp(join(tmpdir(), 'desktop-budget-rpc-'))
  const toServer = new PassThrough()
  const fromServer = new PassThrough()
  const ledger = createProjectBudget(root, root)
  const unknownId = randomUUID()
  await ledger.configure(1)
  await ledger.reserve(unknownId, 0.4)
  await ledger.finish(unknownId, true)
  const serving = serveDesktopStdio(toServer, fromServer, { cwd: root, projectBudget: ledger })
  const client = createDesktopClient(fromServer, toServer)
  try {
    const result = await client.resolveUnknownProjectBudget(unknownId, 0.25)
    expect(result.uncertainReservations).toBe(0)
    expect(result.spentUsd).toBeCloseTo(0.25, 6)
    expect(result.reservedUsd).toBe(0)
    expect((await ledger.get()).uncertain).toEqual([])
  } finally {
    client.close()
    toServer.end()
    await serving
    await rm(root, { recursive: true, force: true })
  }
})
