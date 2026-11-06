import { expect, test } from 'bun:test'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  enqueueMissionJob, listMissionJobs, claimMissionJob, bindMissionJobTurn,
  settleMissionJob, approveMissionJob, retryMissionJob, cancelMissionJob,
  recoverMissionJob, missionJobAssignmentId,
} from '../src/services/agentCenter/missionJobs.js'

async function fixture(run: (root: string, mission: string, project: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'mission-jobs-'))
  try {
    await run(root, 'mission_0123456789abcdef', join(root, 'project'))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

test('任务队列持久化、双宿主并发抢占与审核闭环', async () => {
  await fixture(async (root, mission, project) => {
    const saved = await enqueueMissionJob(mission, project, '查明错误', '调查并交付可验证的修复', root)
    expect(missionJobAssignmentId(saved.id)).toBe('mission-job:' + saved.id)
    expect((await listMissionJobs(mission, project, root))[0]?.id).toBe(saved.id)
    const claims = await Promise.allSettled([
      claimMissionJob(mission, project, saved.id, randomUUID(), process.pid, root),
      claimMissionJob(mission, project, saved.id, randomUUID(), process.pid, root),
    ])
    expect(claims.filter(item => item.status === 'fulfilled')).toHaveLength(1)
    expect(claims.filter(item => item.status === 'rejected')).toHaveLength(1)
    const claimed = (claims.find(item => item.status === 'fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof claimMissionJob>>>).value
    expect(claimed.attempt).toBe(1)
    expect(claimed.status).toBe('running')
    const sessionId = randomUUID(), turnId = randomUUID()
    await bindMissionJobTurn(mission, project, saved.id, claimed.runId!, sessionId, turnId, root)
    await expect(recoverMissionJob(mission, project, saved.id, root))
      .rejects.toThrow('仍存活')
    const review = await settleMissionJob(mission, project, saved.id, claimed.runId!, 'review', '测试通过，等待人工确认', root)
    expect(review.status).toBe('review')
    await expect(retryMissionJob(mission, project, saved.id + 'bad', root)).rejects.toThrow('无效')
    const approved = await approveMissionJob(mission, project, saved.id, root)
    expect(approved.status).toBe('completed')
    expect((await approveMissionJob(mission, project, saved.id, root)).updatedAt).toBe(approved.updatedAt)
    await expect(retryMissionJob(mission, project, saved.id, root)).rejects.toThrow('无法重试')
    expect((await listMissionJobs(mission, project, root))[0]?.history).toHaveLength(1)
    await expect(listMissionJobs(mission, join(root, 'another-project'), root))
      .rejects.toThrow('另一项目')
  })
})

test('被中断的任务不自动重复执行；用户恢复后需再次显式抢占', async () => {
  await fixture(async (root, mission, project) => {
    const queued = await enqueueMissionJob(mission, project, '重试处理', '先调查原外部操作结果，再继续', root)
    const claimed = await claimMissionJob(mission, project, queued.id, randomUUID(), 999999999, root)
    const recovered = await recoverMissionJob(mission, project, queued.id, root)
    expect(recovered.status).toBe('interrupted')
    expect(recovered.attempt).toBe(1)
    expect((await listMissionJobs(mission, project, root))[0]?.status).toBe('interrupted')
    const retried = await retryMissionJob(mission, project, queued.id, root)
    expect(retried.status).toBe('queued')
    expect(retried.attempt).toBe(1)
    const second = await claimMissionJob(mission, project, queued.id, randomUUID(), process.pid, root)
    expect(second.attempt).toBe(2)
    await expect(settleMissionJob(mission, project, queued.id, claimed.runId!, 'review', '旧轮结果', root))
      .rejects.toThrow('另一轮')
    const failed = await settleMissionJob(mission, project, queued.id, second.runId!, 'failed', '工具调用失败', root)
    expect(failed.status).toBe('failed')
    expect(failed.history).toHaveLength(2)
    await expect(approveMissionJob(mission, project, queued.id, root)).rejects.toThrow('待审核')
    expect((await cancelMissionJob(mission, project, queued.id, root)).status).toBe('cancelled')
    expect((await listMissionJobs(mission, project, root))[0]?.attempt).toBe(2)
  })
})

test('任务队列验证输入并守住项目和终态边界', async () => {
  await fixture(async (root, mission, project) => {
    expect(() => enqueueMissionJob(mission, project, ' ', '有效指令', root)).toThrow('标题')
    expect(() => enqueueMissionJob(mission, project, '有效标题', ' ', root)).toThrow('指令')
    await expect(listMissionJobs('../../etc/passwd', project, root)).rejects.toThrow('无效')
    const item = await enqueueMissionJob(mission, project, '停止项目', '用户决定终止', root)
    const cancelled = await cancelMissionJob(mission, project, item.id, root)
    expect(cancelled.status).toBe('cancelled')
    await expect(claimMissionJob(mission, project, item.id, randomUUID(), process.pid, root))
      .rejects.toThrow('不能执行')
    await expect(approveMissionJob(mission, project, item.id, root)).rejects.toThrow('待审核')
    expect((await cancelMissionJob(mission, project, item.id, root)).status).toBe('cancelled')
  })
})
