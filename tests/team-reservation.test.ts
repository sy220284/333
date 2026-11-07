import { expect, test } from 'bun:test'
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { reserveTeamDirectory } from '../src/utils/swarm/teamReservation.js'

test('两个独立会话并发创建同名团队必须分配不同目录', async () => {
  const root = await mkdtemp(join(tmpdir(), 'team-reserve-'))
  try {
    const [a, b] = await Promise.all([
      reserveTeamDirectory('Code Review', root),
      reserveTeamDirectory('Code Review', root),
    ])
    expect(a.teamName).not.toBe(b.teamName)
    expect(a.teamDir).not.toBe(b.teamDir)
    expect((await stat(a.teamDir)).isDirectory()).toBe(true)
    expect((await stat(b.teamDir)).isDirectory()).toBe(true)
    expect((await readdir(root))).toHaveLength(2)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('已有团队目录即便配置尚未写完也必须被保留', async () => {
  const root = await mkdtemp(join(tmpdir(), 'team-unfinished-'))
  try {
    const first = await reserveTeamDirectory('Engineering', root)
    const second = await reserveTeamDirectory('Engineering', root)
    expect(second.teamDir).not.toBe(first.teamDir)
    expect((await stat(first.teamDir)).isDirectory()).toBe(true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('不合法的名称须在创建目录前拒绝', async () => {
  const root = await mkdtemp(join(tmpdir(), 'team-invalid-'))
  try {
    await expect(reserveTeamDirectory(' /? ', root)).rejects.toThrow('英文字母或数字')
    expect(await readdir(root)).toHaveLength(0)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
