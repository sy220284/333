import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createMission, getMission, listMissions, linkMissionAssignment,
  finishMissionAssignment, updateMissionStatus, saveMissionCheckpoint, formatMission,
} from '../src/utils/agentMissions.ts'

test('任务簿持久化任务目标、关联 Agent 与执行结果', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yaoyaoche-missions-'))
  try {
    const created = await createMission('开发并测试核心模块', '/project/repo', root)
    assert.equal(created.status, 'active')
    assert.equal((await listMissions(root))[0]?.id, created.id)
    await linkMissionAssignment(created.id, 'agent-123', 'agent', '代码开发', root)
    await finishMissionAssignment(created.id, 'agent-123', 'completed', root)
    await saveMissionCheckpoint(created.id, '代码开发完成，等待独立测试', root)
    const saved = await getMission(created.id, root)
    assert.equal(saved.assignments[0]?.status, 'completed')
    assert.match(formatMission(saved), /等待独立测试/)
    assert.ok(saved.revision >= 3)
    await updateMissionStatus(created.id, 'paused', root)
    await assert.rejects(
      () => linkMissionAssignment(created.id, 'agent-456', 'agent', '继续执行', root),
      /请先恢复/,
    )
    await updateMissionStatus(created.id, 'active', root)
    await linkMissionAssignment(created.id, 'agent-456', 'agent', '继续执行', root)
    assert.equal((await getMission(created.id, root)).assignments.length, 2)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('任务簿拒绝路径穿越、空目标和非法状态写入', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yaoyaoche-mission-safe-'))
  try {
    await assert.rejects(() => getMission('../../../../etc/passwd', root), /无效/)
    await assert.rejects(() => createMission('   ', '/project', root), /目标/)
    const saved = await createMission('有效目标', '/project', root)
    await assert.rejects(() => saveMissionCheckpoint(saved.id, '', root), /阶段记录/)
    await assert.rejects(() => linkMissionAssignment(saved.id, 'a', 'agent', '', root), /有效/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
