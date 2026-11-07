import { expect, test } from 'bun:test'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  enqueueMissionJob, listMissionJobs, claimMissionJob, bindMissionJobWorkspace, bindMissionJobTurn,
  settleMissionJob, approveMissionJob, retryMissionJob, cancelMissionJob,
  recoverMissionJob, missionJobAssignmentId,
} from '../src/services/agentCenter/missionJobs.js'

function requiredIndex<T>(items: T[], index: number): T {
  const value = items[index]
  if (value === undefined) throw new Error(`测试缺少索引 ${index} 的工作项`)
  return value
}
function requiredRunId(item: { runId?: string }): string {
  if (!item.runId) throw new Error('执行记录没有分配 runId')
  return item.runId
}

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
    expect(missionJobAssignmentId(saved.id)).toBe(`mission-job:${saved.id}`)
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
    await bindMissionJobTurn(mission, project, saved.id, requiredRunId(claimed), sessionId, turnId, root)
    await expect(recoverMissionJob(mission, project, saved.id, root))
      .rejects.toThrow('仍存活')
    const review = await settleMissionJob(mission, project, saved.id, requiredRunId(claimed), 'review', '测试通过，等待人工确认', root)
    expect(review.status).toBe('review')
    await expect(retryMissionJob(mission, project, `${saved.id}bad`, root)).rejects.toThrow('无效')
    const approved = await approveMissionJob(mission, project, saved.id, root)
    expect(approved.status).toBe('completed')
    expect((await approveMissionJob(mission, project, saved.id, root)).updatedAt).toBe(approved.updatedAt)
    await expect(retryMissionJob(mission, project, saved.id, root)).rejects.toThrow('无法重试')
    expect((await listMissionJobs(mission, project, root))[0]?.history).toHaveLength(1)
    await expect(listMissionJobs(mission, join(root, 'another-project'), root))
      .rejects.toThrow('另一项目')
  })
})

test('工作树绑定原执行轮次，不允许改用其他隔离目录',async()=>{
  await fixture(async(root,mission,project)=>{
    const job=await enqueueMissionJob(mission,project,'隔离任务','在独立工作树检查',root)
    const first=await claimMissionJob(mission,project,job.id,randomUUID(),process.pid,root)
    const run=requiredRunId(first)
    const prepared=await bindMissionJobWorkspace(mission,project,job.id,run,{
      worktreePath:'/tmp/worktree-A',worktreeBranch:'worktree-A',
    },root)
    expect(prepared.worktreePath).toBe('/tmp/worktree-A')
    await expect(bindMissionJobWorkspace(mission,project,job.id,run,{
      worktreePath:'/tmp/worktree-B',
    },root)).rejects.toThrow('不能改用其他目录')
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
    await expect(settleMissionJob(mission, project, queued.id, requiredRunId(claimed), 'review', '旧轮结果', root))
      .rejects.toThrow('另一轮')
    const failed = await settleMissionJob(mission, project, queued.id, requiredRunId(second), 'failed', '工具调用失败', root)
    expect(failed.status).toBe('failed')
    expect(failed.history).toHaveLength(2)
    await expect(approveMissionJob(mission, project, queued.id, root)).rejects.toThrow('待审核')
    expect((await cancelMissionJob(mission, project, queued.id, root)).status).toBe('cancelled')
    expect((await listMissionJobs(mission, project, root))[0]?.attempt).toBe(2)
  })
})

test('跨桌面宿主最多并行三项执行，任务进入审核后释放槽位', async () => {
  await fixture(async (root, mission, project) => {
    const jobs = []
    for (let i = 0; i < 4; i++) {
      jobs.push(await enqueueMissionJob(mission, project, `任务${i}`, `专项验证${i}`, root))
    }
    const started = []
    for (let i = 0; i < 3; i++) {
      started.push(await claimMissionJob(mission, project, requiredIndex(jobs, i).id, randomUUID(), process.pid, root))
    }
    await expect(claimMissionJob(mission, project, requiredIndex(jobs, 3).id, randomUUID(), process.pid, root))
      .rejects.toThrow('同一项目最多并行执行 3 项工作')
    await settleMissionJob(mission, project, requiredIndex(jobs, 0).id, requiredRunId(requiredIndex(started, 0)), 'review', '已输出交付内容', root)
    const next = await claimMissionJob(mission, project, requiredIndex(jobs, 3).id, randomUUID(), process.pid, root)
    expect(next.status).toBe('running')
  })
})

test('同一工作区不同 Mission 共享三项并发上限，完成后立即释放资源', async () => {
  await fixture(async (root, mission, project) => {
    const another = 'mission_abcdef0123456789'
    const tasks = await Promise.all([
      enqueueMissionJob(mission, project, 'A', '检查 A', root),
      enqueueMissionJob(mission, project, 'B', '检查 B', root),
      enqueueMissionJob(another, project, 'C', '检查 C', root),
      enqueueMissionJob(another, project, 'D', '检查 D', root),
    ])
    const started = await Promise.all([
      claimMissionJob(mission, project, requiredIndex(tasks,0).id, randomUUID(), process.pid, root),
      claimMissionJob(mission, project, requiredIndex(tasks,1).id, randomUUID(), process.pid, root),
      claimMissionJob(another, project, requiredIndex(tasks,2).id, randomUUID(), process.pid, root),
    ])
    await expect(claimMissionJob(another, project, requiredIndex(tasks,3).id, randomUUID(), process.pid, root))
      .rejects.toThrow('同一项目最多并行')
    await settleMissionJob(mission, project, requiredIndex(started,0).id, requiredRunId(requiredIndex(started,0)), 'review', '已验证', root)
    const resumed = await claimMissionJob(another, project, requiredIndex(tasks,3).id, randomUUID(), process.pid, root)
    expect(resumed.status).toBe('running')
  })
})

test('工作项模型和权限在任务簿持久化，后续执行轮次不得改变所选值',async()=>{
  await fixture(async(root,mission,project)=>{
    const entry=await enqueueMissionJob(mission,project,'定向执行','只分析代码',root,{
      model:'minimax/M3',permissionMode:'plan',
    })
    expect(entry.model).toBe('minimax/M3')
    expect(entry.permissionMode).toBe('plan')
    expect((await listMissionJobs(mission,project,root))[0]).toMatchObject({
      model:'minimax/M3',permissionMode:'plan',
    })
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

test('持久工作项保留长期身份和动态角色，并拒绝只有一半的身份参数',async()=>{
  await fixture(async(root,mission,project)=>{
    await expect(enqueueMissionJob(mission,project,'单项','验证真实产物',root,{
      agentProfileId:randomUUID(),
    })).rejects.toThrow('一起指定')
    const agentProfileId=randomUUID(),roleId=randomUUID()
    const job=await enqueueMissionJob(mission,project,'角色任务','对代码检查归纳规范',root,{
      agentProfileId,roleId,
    })
    const loaded=(await listMissionJobs(mission,project,root)).find(record=>record.id===job.id)
    expect(loaded?.agentProfileId).toBe(agentProfileId)
    expect(loaded?.roleId).toBe(roleId)
  })
})
