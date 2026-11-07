import { expect, test } from 'bun:test'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DesktopRequestSchema } from '../src/services/desktop/protocol.js'
import { createDesktopGateway } from '../src/services/desktop/gateway.js'
import { readProjectTeamInbox, sendProjectTeamMessage } from '../src/services/desktop/teamOperations.js'
import { readMailbox } from '../src/utils/teammateMailbox.js'

test('桌面团队通信：权限边界、幂等、成员邮箱和销毁后不可复活', async () => {
  const root = await mkdtemp(join(tmpdir(), 'desktop-team-'))
  const config = join(root, 'config')
  const project = join(root, 'project')
  const foreign = join(root, 'foreign')
  const teamDir = join(config, 'teams', 'review')
  const previous = process.env.YAOYAOCHE_CONFIG_DIR
  process.env.YAOYAOCHE_CONFIG_DIR = config
  let gateway: ReturnType<typeof createDesktopGateway> | undefined
  try {
    await Promise.all([mkdir(project), mkdir(foreign), mkdir(teamDir, { recursive: true })])
    const team = {
      name: 'review', leadAgentId: 'team-lead@review', leadSessionId: randomUUID(),
      projectDir: project, createdAt: Date.now(),
      members: [
        { agentId: 'team-lead@review', name: 'team-lead', cwd: project, tmuxPaneId: '', subscriptions: [], joinedAt: Date.now() },
        { agentId: 'worker@review', name: 'worker', cwd: project, tmuxPaneId: '', subscriptions: [], joinedAt: Date.now() },
      ],
    }
    await writeFile(join(teamDir, 'config.json'), JSON.stringify(team))
    gateway = createDesktopGateway({ cwd: project, dataDir: join(root, 'data') })
    const requestId = randomUUID()
    const request = DesktopRequestSchema.parse({
      id: randomUUID(), method: 'agents.team.message',
      teamName: 'review', to: 'worker', message: '完成独立检查并回报证据',
      messageId: requestId,
    })
    const result = await gateway.handle(request) as { queued: boolean; recipient: string }
    expect(result).toMatchObject({ queued: true, recipient: 'worker' })
    await gateway.handle(request)
    let mailbox = await readMailbox('worker', 'review')
    expect(mailbox).toHaveLength(1)
    expect(mailbox[0]).toMatchObject({
      from: 'team-lead', text: '完成独立检查并回报证据', read: false, messageId: requestId,
    })
    const inbox = await gateway.handle(DesktopRequestSchema.parse({
      id: randomUUID(), method: 'agents.team.inbox', teamName: 'review', memberName: 'worker',
    })) as { messages: unknown[] }
    expect(inbox.messages).toHaveLength(1)
    expect(await readProjectTeamInbox(project, 'review', 'worker')).toMatchObject({ memberName: 'worker' })

    await expect(sendProjectTeamMessage(foreign, {
      teamName: 'review', to: 'worker', message: '越权任务', messageId: randomUUID(),
    })).rejects.toThrow('团队不属于当前项目')
    await expect(sendProjectTeamMessage(project, {
      teamName: 'review', to: 'outsider', message: '无效成员', messageId: randomUUID(),
    })).rejects.toThrow('有效成员')
    await expect(readProjectTeamInbox(project, 'review', 'outsider')).rejects.toThrow('其他团队成员')
    await expect(sendProjectTeamMessage(project, {
      teamName: 'review', to: 'team-lead', message: '伪造主管消息', messageId: randomUUID(),
    })).rejects.toThrow('有效成员')

    await rm(teamDir, { recursive: true, force: true })
    await expect(gateway.handle(DesktopRequestSchema.parse({
      id: randomUUID(), method: 'agents.team.message',
      teamName: 'review', to: 'worker', message: '失效团队', messageId: randomUUID(),
    }))).rejects.toThrow('已解散')
    expect((await readdir(join(config, 'teams'))).includes('review')).toBe(false)
    mailbox = await readMailbox('worker', 'review')
    expect(mailbox).toHaveLength(0)
  } finally {
    if (gateway) await gateway.close()
    if (previous === undefined) delete process.env.YAOYAOCHE_CONFIG_DIR
    else process.env.YAOYAOCHE_CONFIG_DIR = previous
    await rm(root, { recursive: true, force: true })
  }
})

test('团队通信协议明确拒绝不完整、超长和无幂等标识请求', () => {
  const base = { id: randomUUID(), method: 'agents.team.message', teamName: 'review', to: 'worker' }
  expect(DesktopRequestSchema.safeParse({ ...base, message: 'ok', messageId: randomUUID() }).success).toBe(true)
  expect(DesktopRequestSchema.safeParse({ ...base, message: 'ok' }).success).toBe(false)
  expect(DesktopRequestSchema.safeParse({ ...base, message: ' ', messageId: randomUUID() }).success).toBe(false)
  expect(DesktopRequestSchema.safeParse({ ...base, message: 'x'.repeat(6001), messageId: randomUUID() }).success).toBe(false)
})
