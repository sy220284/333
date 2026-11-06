/**
 * Durable, project-scoped execution tickets for local Super Agents.
 *
 * A ticket is a recorded mandate to carry out one user-submitted instruction.
 * Enqueue, read, restart, and recovery never launch an agent by themselves.
 * Every execution requires an explicit desktop command; a crashed process
 * leaves its ticket for review before any new side effects are attempted.
 */
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { z } from 'zod/v4'
import * as lockfile from '../../utils/lockfile.js'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'

const historySchema = z.object({
  attempt: z.number().int().positive(),
  status: z.enum(['review', 'failed', 'interrupted']),
  summary: z.string().max(4000),
  sessionId: z.string().uuid().optional(),
  finishedAt: z.string(),
}).strict()
const jobSchema = z.object({
  id: z.string().regex(/^job_[a-f0-9]{16}$/),
  title: z.string().min(1).max(200),
  instruction: z.string().min(1).max(6000),
  status: z.enum(['queued', 'running', 'review', 'completed', 'failed', 'interrupted', 'cancelled']),
  attempt: z.number().int().min(0).max(20),
  createdAt: z.string(),
  updatedAt: z.string(),
  runId: z.string().uuid().optional(),
  ownerPid: z.number().int().positive().optional(),
  ownerKey: z.string().uuid().optional(),
  sessionId: z.string().uuid().optional(),
  turnId: z.string().uuid().optional(),
  summary: z.string().max(4000).optional(),
  history: z.array(historySchema).max(20),
}).strict()
const documentSchema = z.object({
  version: z.literal(1),
  missionId: z.string().regex(/^mission_[a-f0-9]{16}$/),
  projectDir: z.string().min(1),
  revision: z.number().int().nonnegative(),
  jobs: z.array(jobSchema).max(200),
}).strict()

export type MissionJob = z.infer<typeof jobSchema>
export type MissionJobStatus = MissionJob['status']
type Document = z.infer<typeof documentSchema>
type StateChange = (current: Document) => { document: Document; job: MissionJob }

export function missionJobAssignmentId(jobId: string): string {
  if (!/^job_[a-f0-9]{16}$/.test(jobId)) throw new Error('无效的任务执行 ID')
  return `mission-job:${jobId}`
}
function validatedMissionId(id: string): string {
  if (!/^mission_[a-f0-9]{16}$/.test(id)) throw new Error('无效的长期任务 ID')
  return id
}
function jobPath(missionId: string, root: string): string {
  return join(root, 'agent-mission-jobs', `${validatedMissionId(missionId)}.json`)
}
function checkedProject(projectDir: string): string {
  if (!projectDir.trim()) throw new Error('任务必须属于明确的项目目录')
  return resolve(projectDir)
}
function assertProject(doc: Document, id: string, projectDir: string): void {
  if (doc.missionId !== id || resolve(doc.projectDir) !== checkedProject(projectDir))
    throw new Error('长期任务执行记录属于另一项目')
}
function requireJob(doc: Document, jobId: string): MissionJob {
  missionJobAssignmentId(jobId)
  const job = doc.jobs.find(job => job.id === jobId)
  if (!job) throw new Error('任务执行记录不存在：' + jobId)
  return job
}
function update(doc: Document, previous: MissionJob, next: MissionJob): Document {
  return { ...doc, revision: doc.revision + 1,
    jobs: doc.jobs.map(job => job.id === previous.id ? next : job) }
}
function now(): string { return new Date().toISOString() }
function plainSummary(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length > 4000) throw new Error('任务结果最多 4000 字符')
  return trimmed
}

/** Reads do not create any state or start a worker. */
export async function listMissionJobs(
  missionId: string, projectDir: string,
  root: string = getClaudeConfigHomeDir(),
): Promise<MissionJob[]> {
  const path = jobPath(missionId, root)
  let raw: string
  try { raw = await readFile(path, 'utf8') }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  if (Buffer.byteLength(raw) > 2_000_000) throw new Error('任务队列文件超过容量限制')
  const doc = documentSchema.parse(JSON.parse(raw))
  assertProject(doc, missionId, projectDir)
  return doc.jobs
}

async function ensureQueue(missionId: string, projectDir: string, root: string): Promise<void> {
  const path = jobPath(missionId, root)
  await mkdir(join(root, 'agent-mission-jobs'), { recursive: true, mode: 0o700 })
  const initial: Document = {
    version: 1, missionId: validatedMissionId(missionId),
    projectDir: checkedProject(projectDir), revision: 0, jobs: [],
  }
  try { await writeFile(path, JSON.stringify(initial), { flag: 'wx', mode: 0o600 }) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  }
}
async function mutate(
  missionId: string, projectDir: string, transform: StateChange,
  root = getClaudeConfigHomeDir(),
): Promise<MissionJob> {
  await ensureQueue(missionId, projectDir, root)
  const path = jobPath(missionId, root)
  const release = await lockfile.lock(path, { retries: { retries: 8, minTimeout: 25, maxTimeout: 250 } })
  try {
    const raw = await readFile(path, 'utf8')
    if (Buffer.byteLength(raw) > 2_000_000) throw new Error('任务队列文件超过容量限制')
    const previous = documentSchema.parse(JSON.parse(raw))
    assertProject(previous, missionId, projectDir)
    const { document, job } = transform(previous)
    if (document === previous) return job
    const verified = documentSchema.parse(document)
    const content = JSON.stringify(verified, null, 2)
    if (Buffer.byteLength(content) > 2_000_000) throw new Error('任务队列文件超过容量限制')
    const tmp = `${path}.${randomUUID()}.tmp`
    try {
      await writeFile(tmp, content, { mode: 0o600, flag: 'wx' })
      await rename(tmp, path)
    } finally { await rm(tmp, { force: true }) }
    return job
  } finally { await release() }
}

export function enqueueMissionJob(
  missionId: string, projectDir: string, title: string, instruction: string,
  root?: string,
): Promise<MissionJob> {
  const trimmedTitle = title.trim()
  const trimmedInstruction = instruction.trim()
  if (!trimmedTitle || trimmedTitle.length > 200 || !trimmedInstruction || trimmedInstruction.length > 6000)
    throw new Error('执行任务需提供 1–200 字标题及 1–6000 字指令')
  return mutate(missionId, projectDir, doc => {
    if (doc.jobs.length >= 200) throw new Error('任务队列已达 200 项上限')
    const time = now()
    const job: MissionJob = {
      id: `job_${randomUUID().replaceAll('-', '').slice(0, 16)}`,
      title: trimmedTitle, instruction: trimmedInstruction, status: 'queued',
      attempt: 0, createdAt: time, updatedAt: time, history: [],
    }
    return { document: { ...doc, revision: doc.revision + 1, jobs: [...doc.jobs, job] }, job }
  }, root)
}

/** Reserve before any model call, so a second host cannot run the same ticket. */
export function claimMissionJob(
  missionId: string, projectDir: string, jobId: string, ownerKey: string,
  ownerPid: number, root?: string,
): Promise<MissionJob> {
  if (!z.string().uuid().safeParse(ownerKey).success || !Number.isInteger(ownerPid) || ownerPid < 1)
    throw new Error('无效的任务执行宿主身份')
  return mutate(missionId, projectDir, doc => {
    const job = requireJob(doc, jobId)
    if (job.status !== 'queued') throw new Error('任务目前不能执行：' + job.status)
    // A bounded shared worker pool: concurrent desktop hosts consult the
    // same locked mission record before they allocate another SDK process.
    if (doc.jobs.filter(item => item.status === 'running').length >= 3)
      throw new Error('本长期任务最多同时执行 3 项工作，请等待或先恢复中断任务')
    if (job.attempt >= 20) throw new Error('任务执行已达到 20 次上限')
    const next: MissionJob = {
      ...job, status: 'running', attempt: job.attempt + 1,
      updatedAt: now(), runId: randomUUID(), ownerKey, ownerPid,
      sessionId: undefined, turnId: undefined, summary: undefined,
    }
    return { document: update(doc, job, next), job: next }
  }, root)
}

export function bindMissionJobTurn(
  missionId: string, projectDir: string, jobId: string, runId: string,
  sessionId: string, turnId?: string, root?: string,
): Promise<MissionJob> {
  if (!z.string().uuid().safeParse(sessionId).success || (turnId && !z.string().uuid().safeParse(turnId).success))
    throw new Error('无效的会话与轮次标识')
  return mutate(missionId, projectDir, doc => {
    const job = requireJob(doc, jobId)
    if (job.runId !== runId) throw new Error('任务执行已被另一轮替换')
    if (job.status !== 'running') return { document: doc, job }
    const next = { ...job, sessionId, ...(turnId && { turnId }), updatedAt: now() }
    return { document: update(doc, job, next), job: next }
  }, root)
}

export function settleMissionJob(
  missionId: string, projectDir: string, jobId: string, runId: string,
  status: 'review' | 'failed' | 'interrupted', summary: string,
  root?: string,
): Promise<MissionJob> {
  const note = plainSummary(summary)
  return mutate(missionId, projectDir, doc => {
    const job = requireJob(doc, jobId)
    if (job.runId !== runId) throw new Error('任务执行已被另一轮替换')
    if (job.status === status) return { document: doc, job }
    if (job.status !== 'running') throw new Error('任务执行已终结为 ' + job.status)
    const next: MissionJob = {
      ...job, status, summary: note, updatedAt: now(),
      history: [...job.history, {
        attempt: job.attempt, status, summary: note,
        ...(job.sessionId && { sessionId: job.sessionId }), finishedAt: now(),
      }],
    }
    return { document: update(doc, job, next), job: next }
  }, root)
}

export function approveMissionJob(missionId: string, projectDir: string, jobId: string, root?: string): Promise<MissionJob> {
  return mutate(missionId, projectDir, doc => {
    const job = requireJob(doc, jobId)
    if (job.status === 'completed') return { document: doc, job }
    if (job.status !== 'review') throw new Error('任务须先提供待审核结果')
    const next: MissionJob = { ...job, status: 'completed', updatedAt: now() }
    return { document: update(doc, job, next), job: next }
  }, root)
}

export function retryMissionJob(missionId: string, projectDir: string, jobId: string, root?: string): Promise<MissionJob> {
  return mutate(missionId, projectDir, doc => {
    const job = requireJob(doc, jobId)
    if (!['failed', 'interrupted', 'review'].includes(job.status)) throw new Error('当前任务状态无法重试')
    if (job.attempt >= 20) throw new Error('任务执行已达到 20 次上限')
    const next: MissionJob = {
      ...job, status: 'queued', updatedAt: now(),
      runId: undefined, ownerPid: undefined, ownerKey: undefined,
      sessionId: undefined, turnId: undefined, summary: undefined,
    }
    return { document: update(doc, job, next), job: next }
  }, root)
}

export function cancelMissionJob(missionId: string, projectDir: string, jobId: string, root?: string): Promise<MissionJob> {
  return mutate(missionId, projectDir, doc => {
    const job = requireJob(doc, jobId)
    if (job.status === 'cancelled') return { document: doc, job }
    if (job.status === 'running' || job.status === 'completed') throw new Error('运行中的任务需先中断；已完成的任务保留归档')
    const next: MissionJob = { ...job, status: 'cancelled', updatedAt: now() }
    return { document: update(doc, job, next), job: next }
  }, root)
}
export function isLiveProcess(pid: number): boolean {
  if (!Number.isInteger(pid) || pid < 1) return false
  try { process.kill(pid, 0); return true }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false
    if ((error as NodeJS.ErrnoException).code === 'EPERM') return true
    throw error
  }
}

/** Explicit crash repair. Live workers are never seized from another host. */
export async function recoverMissionJob(
  missionId: string, projectDir: string, jobId: string, root?: string,
): Promise<MissionJob> {
  return mutate(missionId, projectDir, doc => {
    const job = requireJob(doc, jobId)
    if (job.status !== 'running') return { document: doc, job }
    if (job.ownerPid && isLiveProcess(job.ownerPid))
      throw new Error('原执行宿主仍存活，请在原会话停止任务后再恢复')
    const note = '原执行宿主已退出。请核对既有文件、提交及外部操作后，显式重试。'
    const next: MissionJob = {
      ...job, status: 'interrupted', summary: note, updatedAt: now(),
      history: [...job.history, {
        attempt: job.attempt, status: 'interrupted',
        summary: note, ...(job.sessionId && { sessionId: job.sessionId }),
        finishedAt: now(),
      }],
    }
    return { document: update(doc, job, next), job: next }
  }, root)
}
