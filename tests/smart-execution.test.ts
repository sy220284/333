import { test, expect } from 'bun:test'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSmartExecutionJournal, getSmartExecutionJournalFile } from '../src/services/desktop/smartExecutionJournal.js'
import { planLocalProjectPurge, executeLocalProjectPurge } from '../src/services/desktop/maintenance.js'
import { createDesktopGateway, type DesktopGatewayOptions } from '../src/services/desktop/gateway.js'
import { DesktopRequestSchema } from '../src/services/desktop/protocol.js'

const sid = () => randomUUID()
const request = (method: string, body: Record<string, unknown> = {}) =>
  DesktopRequestSchema.parse({ id: sid(), method, ...body })

async function waitFor(predicate: () => boolean): Promise<void> {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > 2000) throw new Error('Timed out waiting for execution result')
    await new Promise(resolve => setTimeout(resolve, 5))
  }
}

test('智能执行本地账本保存任务元数据，禁止记录任务提示词和密钥', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yaoyao-smart-'))
  const project = join(root, 'project')
  try {
    const journal = createSmartExecutionJournal(project, root)
    const id = sid()
    await journal.start({ sessionId: id, model: 'fixture-model',
      permissionMode: 'default', status: 'running', startedAt: new Date().toISOString() })
    expect((await journal.list())[0]?.status).toBe('running')
    await journal.finish(id, 'completed', 1.2345)
    expect(await journal.list()).toMatchObject([{ sessionId: id, status: 'completed', costUsd: 1.2345 }])
    await expect(journal.finish(id, 'completed')).rejects.toThrow('already finalized')
    const path = join(root, `${createHash('sha256').update(project).digest('hex')}.json`)
    const file = await readFile(path, 'utf8')
    expect(file).not.toContain('prompt')
    expect(file).not.toContain('API_KEY')
    expect(file).not.toContain('secret')
  } finally { await rm(root, { force: true, recursive: true }) }
})

test('本地工作区清理预览和执行完整覆盖智能执行账本', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yaoyao-smart-purge-'))
  const project = join(root, 'project')
  const journalRoot = join(root, 'journal')
  try {
    await mkdir(project, { recursive: true })
    const journal = createSmartExecutionJournal(project, journalRoot)
    await journal.start({ sessionId: sid(), model: 'fixture-model',
      permissionMode: 'default', status: 'running', startedAt: new Date().toISOString() })
    const planned = await planLocalProjectPurge(project, journalRoot)
    const path = getSmartExecutionJournalFile(project, journalRoot)
    const matching = planned.items.filter(item => item.path === path)
    expect(matching).toHaveLength(1)
    expect(matching[0]?.kind).toBe('file')
    const result = await executeLocalProjectPurge(matching)
    expect(result).toMatchObject({ deleted: 1, total: 1, errors: [] })
    expect(await journal.list()).toEqual([])
  } finally { await rm(root, { force: true, recursive: true }) }
})

test('两个桌面会话并行写入同一项目账本不会互相覆盖', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yaoyao-smart-parallel-'))
  try {
    const journal = createSmartExecutionJournal(root, root)
    const ids = Array.from({ length: 8 }, sid)
    await Promise.all(ids.map(sessionId => journal.start({
      sessionId, model: 'fixture-model', permissionMode: 'default',
      status: 'running', startedAt: new Date().toISOString(),
    })))
    await Promise.all(ids.map(sessionId => journal.finish(sessionId, 'completed', 0.125)))
    const history = await journal.list()
    expect(history).toHaveLength(ids.length)
    expect(history.every(item => item.status === 'completed')).toBe(true)
    expect(new Set(history.map(item => item.sessionId)).size).toBe(ids.length)
  } finally { await rm(root, { force: true, recursive: true }) }
})

test('一个智能执行入口完成离线预检、SDK 预算权限传递、事件和历史记录', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yaoyao-smart-gateway-'))
  const project = join(root, 'project')
  const launchOptions: Array<Record<string, unknown>> = []
  const messages: string[] = []
  const events: Array<{event: string; [key: string]: unknown}> = []
  const journal = createSmartExecutionJournal(project, root)
  const options: DesktopGatewayOptions = {
    cwd: project, model: 'fixture-model', smartJournal: journal,
    createSession: ((options: Record<string, unknown>) => {
      launchOptions.push(options)
      const sessionId = sid()
      const subscriptions = { subscribe: () => () => {} }
      const inbox = { ...subscriptions, getPending: () => [], cancelPending: () => {} }
      return {
        sessionId,
        initialization: Promise.resolve({ models: [], agents: [] }),
        state: { ...subscriptions, getState: () => ({ phase: 'idle' }) },
        permissions: inbox, hostControls: inbox,
        send: async (prompt: string) => { messages.push(prompt) },
        async *stream() { yield {
          type: 'result', subtype: 'success', is_error: false,
          terminal_reason: 'completed', total_cost_usd: 0.32,
        } },
        control: async () => ({}), interrupt: async () => {},
        close: () => {}, closeAndWait: async () => {},
      }
    }) as NonNullable<DesktopGatewayOptions['createSession']>,
  }
  const gateway = createDesktopGateway(options)
  const unsub = gateway.subscribe(event => { events.push(event) })
  try {
    expect(DesktopRequestSchema.safeParse({ id: sid(), method: 'smart.execute', prompt: '' }).success).toBe(false)
    expect(DesktopRequestSchema.safeParse({ id: sid(), method: 'smart.execute', prompt: 'do', maxBudgetUsd: -1 }).success).toBe(false)
    const inspection = await gateway.handle(request('smart.inspect')) as { checkedOffline: boolean; status: string }
    expect(inspection).toMatchObject({ checkedOffline: true, status: 'native' })
    const result = await gateway.handle(request('smart.execute', {
      prompt: '修复项目问题，SECRET_KEY=do-not-store',
      maxBudgetUsd: 1.25, permissionMode: 'plan',
    })) as { sessionId: string; turnId: string }
    expect(result.sessionId).toBeTruthy()
    expect(result.turnId).toBeTruthy()
    expect(messages).toEqual(['修复项目问题，SECRET_KEY=do-not-store'])
    expect(launchOptions[0]).toMatchObject({
      model: 'fixture-model', maxBudgetUsd: 1.25,
      permissionMode: 'plan', cwd: project,
    })
    await waitFor(() => events.some(event => event.event === 'smart.finished'))
    const records = await gateway.handle(request('smart.history')) as Array<{
      sessionId: string; status: string; costUsd: number; budgetUsd: number
    }>
    expect(records[0]).toMatchObject({
      sessionId: result.sessionId, status: 'completed',
      costUsd: 0.32, budgetUsd: 1.25,
    })
    const file = await readFile(join(root,
      `${createHash('sha256').update(project).digest('hex')}.json`), 'utf8')
    expect(file).not.toContain('SECRET_KEY')
    expect(file).not.toContain('修复项目问题')
  } finally {
    unsub()
    await gateway.close()
    await rm(root, { force: true, recursive: true })
  }
})
