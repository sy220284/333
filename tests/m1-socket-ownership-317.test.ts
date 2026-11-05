import { test, expect } from 'bun:test'
import { createServer } from 'node:net'
import { mkdtemp, lstat, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  assertSocketVacant317,
  captureSocketIdentity317,
  unlinkOwnedSocket317,
} from '../src/bootstrap/socketOwnership317.ts'

test('317 socket cleanup refuses another owner or a replacement file', async () => {
  if (process.platform === 'win32') return
  const dir = await mkdtemp(join(tmpdir(), 'cc-socket-owner-'))
  const path = join(dir, 'background.sock')
  const server = createServer()
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(path, () => { server.off('error', reject); resolve() })
    })
    const owner = await captureSocketIdentity317(path, 'Background supervisor')
    await expect(assertSocketVacant317(path, 'Background supervisor')).rejects.toThrow()
    expect(await unlinkOwnedSocket317(path, { ...owner, ino: owner.ino + 1 })).toBe(false)
    expect((await lstat(path)).isSocket()).toBe(true)
    await new Promise<void>((resolve, reject) =>
      server.close(error => error ? reject(error) : resolve()))
    await writeFile(path, 'replacement owner')
    expect(await unlinkOwnedSocket317(path, owner)).toBe(false)
    expect((await lstat(path)).isFile()).toBe(true)
  } finally {
    if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()))
    await rm(dir, { recursive: true, force: true })
  }
})
