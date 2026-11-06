/**
 * Persistent local Super-Agent missions.
 * A mission is an authorized unit of work; assignments are individual Agent /
 * Workflow executions. The runtime never starts a job merely by loading one.
 */
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { z } from 'zod/v4'
import { getFeatureValue_CACHED_MAY_BE_STALE, setGrowthBookConfigOverride } from '../services/analytics/growthbook.js'
import { getClaudeConfigHomeDir } from './envUtils.js'
import { getCwd } from './cwd.js'
import * as lockfile from './lockfile.js'

const AssignmentSchema = z.object({
  id: z.string().min(1).max(256),
  kind: z.enum(['agent', 'workflow', 'team']),
  title: z.string().min(1).max(512),
  status: z.enum(['running', 'completed', 'failed', 'killed']),
  updatedAt: z.string(),
}).strict()

const MissionSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().regex(/^mission_[a-f0-9]{16}$/),
  objective: z.string().min(1).max(4000),
  projectDir: z.string().min(1),
  status: z.enum(['active', 'paused', 'completed']),
  checkpoint: z.string().max(6000),
  createdAt: z.string(),
  updatedAt: z.string(),
  revision: z.number().int().nonnegative(),
  assignments: z.array(AssignmentSchema).max(500),
}).strict()

export type AgentMission = z.infer<typeof MissionSchema>
export type MissionAssignmentKind = AgentMission['assignments'][number]['kind']
export type MissionAssignmentStatus = AgentMission['assignments'][number]['status']
export type AgentMissionStatus = AgentMission['status']

function directory(root: string): string {
  return join(root, 'agent-missions')
}
function defaultRoot(): string {
  return getClaudeConfigHomeDir()
}
function checkedId(id: string): string {
  if (!/^mission_[a-f0-9]{16}$/.test(id)) throw new Error('无效的超级智能体任务 ID')
  return id
}
function missionPath(id: string, root: string): string {
  return join(directory(root), `${checkedId(id)}.json`)
}
function parseMission(content: string, path: string): AgentMission {
  try {
    return MissionSchema.parse(JSON.parse(content))
  } catch (error) {
    throw new Error(`本地超级智能体任务记录损坏：${path}；${String(error)}`)
  }
}

/** Each project keeps its own active mission, even when multiple CLIs share a config home. */
export function missionSelectionKey(projectDir: string): string {
  const project = resolve(projectDir)
  return `local_agent_current_mission_${createHash('sha256').update(project).digest('hex').slice(0, 20)}`
}
export function getSelectedMissionId(projectDir = getCwd()): string | undefined {
  const id = getFeatureValue_CACHED_MAY_BE_STALE<string>(missionSelectionKey(projectDir), '')
  if (!id) return undefined
  return checkedId(id)
}
export function selectMission(id?: string, projectDir = getCwd()): void {
  setGrowthBookConfigOverride(missionSelectionKey(projectDir), id ? checkedId(id) : undefined)
}

export async function createMission(objective: string, projectDir: string, root = defaultRoot()): Promise<AgentMission> {
  const value = objective.trim()
  if (!value || value.length > 4000) throw new Error('任务目标应包含 1–4000 个字符')
  if (!projectDir.trim()) throw new Error('任务必须指定项目目录')
  await mkdir(directory(root), { recursive: true, mode: 0o700 })
  const now = new Date().toISOString()
  const mission: AgentMission = {
    schemaVersion: 1,
    id: `mission_${randomUUID().replaceAll('-', '').slice(0, 16)}`,
    objective: value,
    projectDir,
    status: 'active',
    checkpoint: '',
    createdAt: now,
    updatedAt: now,
    revision: 0,
    assignments: [],
  }
  await writeFile(missionPath(mission.id, root), JSON.stringify(mission, null, 2), { flag: 'wx', mode: 0o600 })
  return mission
}

export async function getMission(id: string, root = defaultRoot()): Promise<AgentMission> {
  const path = missionPath(id, root)
  return parseMission(await readFile(path, 'utf8'), path)
}

export async function listMissions(root = defaultRoot()): Promise<AgentMission[]> {
  let files: string[]
  try {
    files = await readdir(directory(root))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  const ids = files.filter(name => /^mission_[a-f0-9]{16}\.json$/.test(name))
    .map(name => name.slice(0, -5))
  const missions = await Promise.all(ids.map(id => getMission(id, root)))
  return missions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

async function changeMission(
  id: string,
  transform: (previous: AgentMission) => AgentMission,
  root = defaultRoot(),
): Promise<AgentMission> {
  const path = missionPath(id, root)
  // Lock the existing record across sessions. Temp+rename prevents partial JSON.
  const release = await lockfile.lock(path, { retries: { retries: 5, minTimeout: 20, maxTimeout: 200 } })
  try {
    const previous = await getMission(id, root)
    const candidate = transform(previous)
    const next = MissionSchema.parse({
      ...candidate,
      id: previous.id,
      schemaVersion: 1,
      createdAt: previous.createdAt,
      revision: previous.revision + 1,
      updatedAt: new Date().toISOString(),
    })
    const tmp = `${path}.${randomUUID()}.tmp`
    try {
      await writeFile(tmp, JSON.stringify(next, null, 2), { flag: 'wx', mode: 0o600 })
      await rename(tmp, path)
    } finally {
      await rm(tmp, { force: true })
    }
    return next
  } finally {
    await release()
  }
}

export function formatMission(mission: AgentMission): string {
  const items = mission.assignments.map(a => `  · [${a.status}] ${a.kind} ${a.title} (${a.id})`)
  return [
    `任务：${mission.id}`,
    `目标：${mission.objective}`,
    `项目：${mission.projectDir}`,
    `状态：${mission.status}`,
    `版本：${mission.revision}`,
    `阶段记录：${mission.checkpoint || '尚未填写'}`,
    `关联工作：${items.length ? `\n${items.join('\n')}` : '无'}`,
  ].join('\n')
}

/** This is injected only as context; reading a mission never schedules or starts work. */
export function getSelectedMissionPrompt(): string {
  const id = getSelectedMissionId()
  if (!id) return ''
  const path = missionPath(id, defaultRoot())
  try {
    const mission = parseMission(readFileSync(path, 'utf8'), path)
    if (resolve(mission.projectDir) !== resolve(getCwd())) {
      return '该超级智能体任务归属其他项目，请切换至对应项目目录后恢复。'
    }
    const assignments = mission.assignments.slice(-12).map(a =>
      `${a.kind}:${a.id}(${a.status}) ${a.title}`
    ).join('\n')
    return [
      '本地超级智能体任务档案（仅作上下文；执行外部操作仍按用户权限审批）：',
      `任务ID：${mission.id}`,
      `目标：${mission.objective}`,
      `项目：${mission.projectDir}`,
      `状态：${mission.status}`,
      `最近阶段：${mission.checkpoint || '尚无阶段记录'}`,
      `关联执行：\n${assignments || '无'}`,
      '如果任务已暂停或完成，先请求用户明确恢复或创建新的任务。',
    ].join('\n')
  } catch (error) {
    return `本地超级智能体任务档案无法读取，请先通过 /agents mission show 修复：${String(error)}`
  }
}

/** All execution paths use the same project-scoped mandate check before side effects. */
export async function requireActiveSelectedMission(
  projectDir = getCwd(),
  root = defaultRoot(),
): Promise<string | undefined> {
  const id = getSelectedMissionId(projectDir)
  if (!id) return undefined
  const mission = await getMission(id, root)
  if (resolve(mission.projectDir) !== resolve(projectDir))
    throw new Error(`超级智能体任务归属其他项目：${mission.projectDir}`)
  if (mission.status !== 'active')
    throw new Error(`超级智能体任务处于 ${mission.status}，请先执行 /agents mission resume`)
  return mission.id
}

export async function updateMissionStatus(id: string, status: AgentMissionStatus, root = defaultRoot()): Promise<AgentMission> {
  return changeMission(id, mission => {
    if (status === 'completed') {
      const pending = mission.assignments.filter(assignment => assignment.status === 'running')
      if (pending.length > 0)
        throw new Error(`长期任务仍有 ${pending.length} 项运行中的关联执行；请先完成或停止它们再结束任务`)
    }
    if (mission.status === status) return mission
    return { ...mission, status }
  }, root)
}
export async function saveMissionCheckpoint(id: string, checkpoint: string, root = defaultRoot()): Promise<AgentMission> {
  if (!checkpoint.trim() || checkpoint.length > 6000) throw new Error('阶段记录需要 1–6000 个字符')
  return changeMission(id, mission => ({ ...mission, checkpoint: checkpoint.trim() }), root)
}
export async function linkMissionAssignment(
  id: string, assignmentId: string, kind: MissionAssignmentKind, title: string, root = defaultRoot(),
): Promise<AgentMission> {
  if (!assignmentId.trim() || assignmentId.length > 256 || !title.trim() || title.length > 512)
    throw new Error('关联任务需要有效的任务 ID 和标题')
  return changeMission(id, mission => {
    if (mission.status !== 'active') throw new Error(`超级智能体任务处于 ${mission.status}，请先恢复`)
    if (mission.assignments.some(item => item.id === assignmentId)) return mission
    if (mission.assignments.length >= 500) throw new Error('关联任务已达到上限')
    return { ...mission, assignments: [...mission.assignments, {
      id: assignmentId, kind, title, status: 'running', updatedAt: new Date().toISOString(),
    }] }
  }, root)
}
export async function finishMissionAssignment(
  id: string, assignmentId: string, status: Exclude<MissionAssignmentStatus, 'running'>, root = defaultRoot(),
): Promise<AgentMission> {
  return changeMission(id, mission => {
    const assignment = mission.assignments.find(a => a.id === assignmentId)
    if (!assignment) throw new Error(`任务簿找不到关联工作 ${assignmentId}`)
    // A completed execution is immutable. Shutdown/abort races may report the
    // same terminal outcome twice but may not overwrite a different outcome.
    if (assignment.status !== 'running' && assignment.status !== status)
      throw new Error(`关联执行 ${assignmentId} 已终结为 ${assignment.status}，不能改为 ${status}`)
    if (assignment.status === status) return mission
    return { ...mission, assignments: mission.assignments.map(a =>
      a.id === assignmentId ? { ...a, status, updatedAt: new Date().toISOString() } : a
    ) }
  }, root)
}
export async function findMissionByAssignmentId(
  assignmentId: string,
  root = defaultRoot(),
  projectDir = getCwd(),
): Promise<string | undefined> {
  // Names can be reused after a team is deleted. Only a currently running
  // assignment in the originating project may be finalized.
  const matches = (await listMissions(root)).filter(mission =>
    resolve(mission.projectDir) === resolve(projectDir) &&
    mission.assignments.some(a => a.id === assignmentId && a.status === 'running')
  )
  if (matches.length > 1) {
    throw new Error(`同一项目存在多个运行中的关联任务：${assignmentId}，请先核对任务档案`)
  }
  return matches[0]?.id
}
