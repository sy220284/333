/**
 * Repair an interrupted two-record Mission/Job finalization. Both original
 * journals use atomic replacement and idempotent terminal updates, but writing
 * two distinct files cannot be atomic across a host crash. This reader-side
 * reconciliation makes the persisted terminal outcome authoritative without
 * starting a model, repeating a tool or changing a live assignment.
 */
import { getMission, finishMissionAssignment } from '../../utils/agentMissions.js'
import { listMissionJobs, missionJobAssignmentId } from './missionJobs.js'

export async function reconcileMissionTerminalJobs(
  missionId: string,
  projectDir: string,
  root?: string,
): Promise<void> {
  const [mission, jobs] = await Promise.all([
    getMission(missionId, root),
    listMissionJobs(missionId, projectDir, root),
  ])
  const assignments = new Map(mission.assignments.map(item => [item.id, item]))
  for (const job of jobs) {
    if (job.status !== 'completed' && job.status !== 'cancelled') continue
    const assignmentId = missionJobAssignmentId(job.id)
    const assignment = assignments.get(assignmentId)
    // Enqueue may be cancelled before an assignment was linked.
    if (!assignment) {
      if (job.status === 'completed') throw new Error(`已完成工作项缺少长期任务关联：${job.id}`)
      continue
    }
    const expected = job.status === 'completed' ? 'completed' : 'killed'
    if (assignment.status === expected) continue
    if (assignment.status !== 'running')
      throw new Error(`长期任务与工作项终态冲突：${job.id} (Job ${job.status}, Mission ${assignment.status})`)
    await finishMissionAssignment(missionId, assignmentId, expected, root)
  }
}
