import { test, expect } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildMissedTaskNotification,
  watchScheduledTasks,
} from '../src/entrypoints/agentSdkTypes.ts'

test('317 SDK uses the native missed-task user-consent formatter', () => {
  const message = buildMissedTaskNotification([{
    id: 'demo', cron: '* * * * *',
    prompt: 'Never execute this automatically',
    createdAt: Date.now() - 120_000,
  }])
  expect(message).toContain('AskUserQuestion')
  expect(message).toContain('Only execute if the user confirms')
  expect(message).toContain('Never execute this automatically')
})
test('317 SDK daemon scheduler closes its async event stream on abort', async () => {
  const dir = mkdtempSync(join(tmpdir(), '333-sdk-cron-'))
  const controller = new AbortController()
  try {
    const handle = watchScheduledTasks({ dir, signal: controller.signal })
    expect(handle.getNextFireTime()).toBeNull()
    const stream = handle.events()
    const next = stream.next()
    controller.abort()
    expect((await next).done).toBe(true)
    expect(handle.getNextFireTime()).toBeNull()
    await expect(async () => {
      for await (const unused of handle.events()) void unused
    }).toThrow()
  } finally {
    controller.abort()
    rmSync(dir, { recursive: true, force: true })
  }
})
