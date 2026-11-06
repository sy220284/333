import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createMission, getMission, listMissions, linkMissionAssignment,
  finishMissionAssignment, updateMissionStatus, saveMissionCheckpoint, formatMission,
  findMissionByAssignmentId, getSelectedMissionId, selectMission, requireActiveSelectedMission,
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

test('重复任务更新保留版本号，只有可核实的进展会触发新版本', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yaoyaoche-mission-idempotency-'))
  try {
    const mission = await createMission('连续推进直到完成', '/project/idempotency', root)
    const first = await saveMissionCheckpoint(mission.id, '阶段一已核实', root)
    const repeatCheckpoint = await saveMissionCheckpoint(mission.id, '  阶段一已核实  ', root)
    assert.equal(repeatCheckpoint.revision, first.revision)
    assert.equal(repeatCheckpoint.updatedAt, first.updatedAt)
    const repeatStatus = await updateMissionStatus(mission.id, 'active', root)
    assert.equal(repeatStatus.revision, first.revision)
    const assigned = await linkMissionAssignment(mission.id, 'agent:once', 'agent', '实际开发', root)
    const duplicated = await linkMissionAssignment(mission.id, 'agent:once', 'agent', '实际开发', root)
    assert.equal(duplicated.revision, assigned.revision)
    const finished = await finishMissionAssignment(mission.id, 'agent:once', 'completed', root)
    const repeatedFinished = await finishMissionAssignment(mission.id, 'agent:once', 'completed', root)
    assert.equal(repeatedFinished.revision, finished.revision)
    const progressed = await saveMissionCheckpoint(mission.id, '阶段二测试通过', root)
    assert.equal(progressed.revision, finished.revision + 1)
    assert.equal((await getMission(mission.id, root)).revision, progressed.revision)
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

test('同名团队重复使用时只匹配当前项目中运行的长期任务', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yaoyaoche-mission-team-reuse-'))
  try {
    const oldMission = await createMission('旧项目', '/project/old', root)
    const newMission = await createMission('新项目', '/project/new', root)
    await linkMissionAssignment(oldMission.id, 'team:reused', 'team', '旧团队', root)
    await finishMissionAssignment(oldMission.id, 'team:reused', 'completed', root)
    await linkMissionAssignment(newMission.id, 'team:reused', 'team', '新团队', root)
    assert.equal(await findMissionByAssignmentId('team:reused', root, '/project/new'), newMission.id)
    assert.equal(await findMissionByAssignmentId('team:reused', root, '/project/old'), undefined)
    assert.equal(await findMissionByAssignmentId('team:reused', root, '/project/other'), undefined)
    await finishMissionAssignment(newMission.id, 'team:reused', 'completed', root)
    assert.equal(await findMissionByAssignmentId('team:reused', root, '/project/new'), undefined)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('长期任务执行入口校验本项目状态，终态不可被并发结果覆盖', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yaoyaoche-mission-gate-'))
  const project = '/project/mission-guard'
  const before = getSelectedMissionId(project)
  try {
    const mission = await createMission('会话间持续执行', project, root)
    selectMission(mission.id, project)
    assert.equal(await requireActiveSelectedMission(project, root), mission.id)
    await linkMissionAssignment(mission.id, 'agent-guard', 'agent', '首轮执行', root)
    await updateMissionStatus(mission.id, 'paused', root)
    await assert.rejects(() => requireActiveSelectedMission(project, root), /请先执行 \/agents mission resume/)
    await updateMissionStatus(mission.id, 'active', root)
    await finishMissionAssignment(mission.id, 'agent-guard', 'completed', root)
    await finishMissionAssignment(mission.id, 'agent-guard', 'completed', root)
    await assert.rejects(
      () => finishMissionAssignment(mission.id, 'agent-guard', 'killed', root),
      /不能改为 killed/,
    )
    await updateMissionStatus(mission.id, 'completed', root)
    await assert.rejects(() => requireActiveSelectedMission(project, root), /请先执行 \/agents mission resume/)
  } finally {
    selectMission(before, project)
    await rm(root, { recursive: true, force: true })
  }
})

test('长期任务只在关联执行全部终结后允许正式完成', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yaoyaoche-mission-close-'))
  try {
    const mission = await createMission('验收前完成所有工作', '/project/test-close', root)
    await linkMissionAssignment(mission.id, 'workflow-running', 'workflow', '独立验证', root)
    await assert.rejects(
      () => updateMissionStatus(mission.id, 'completed', root),
      /仍有 1 项运行中的关联执行/,
    )
    await updateMissionStatus(mission.id, 'paused', root)
    await finishMissionAssignment(mission.id, 'workflow-running', 'completed', root)
    assert.equal((await updateMissionStatus(mission.id, 'completed', root)).status, 'completed')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
