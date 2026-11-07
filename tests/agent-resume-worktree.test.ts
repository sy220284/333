import { expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { verifyResumedAgentWorktree } from '../src/tools/AgentTool/resumeWorktree.js'

test('没有隔离工作树元数据的普通 Agent 正常恢复原有上下文', async () => {
  expect(await verifyResumedAgentWorktree()).toBeUndefined()
})

test('仍存在的隔离工作树恢复时只使用原目录，并更新最近使用时间', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'resume-agent-worktree-'))
  try {
    const recovered = await verifyResumedAgentWorktree(dir)
    expect(recovered).toBe(dir)
    expect((await stat(dir)).isDirectory()).toBe(true)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('已被删除的隔离工作树必须明确失败，防止重新写入用户主目录', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'removed-agent-worktree-'))
  await rm(dir, { recursive: true })
  await expect(verifyResumedAgentWorktree(dir))
    .rejects.toThrow('原智能体工作树已被删除')
})

test('原路径变成普通文件时必须拒绝恢复', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wrong-worktree-'))
  try {
    const path = join(dir, 'isolated-workspace')
    await writeFile(path, 'no longer a git worktree')
    await expect(verifyResumedAgentWorktree(path)).rejects.toThrow('已不是目录')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
