import { stat, utimes } from 'node:fs/promises'

/**
 * A resumed isolated agent must keep its original filesystem boundary.
 * Reusing the parent checkout after a deleted worktree would silently redirect
 * the agent's edits into the user's working branch.
 */
export async function verifyResumedAgentWorktree(path?: string): Promise<string | undefined> {
  if (!path) return undefined

  let info: Awaited<ReturnType<typeof stat>>
  try {
    info = await stat(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      throw new Error(`原智能体工作树已被删除：${path}。请先恢复对应工作树或重新创建隔离任务后再执行。`)
    throw error
  }
  if (!info.isDirectory())
    throw new Error(`原智能体工作树已不是目录：${path}。请核对任务状态后恢复原隔离环境。`)

  // Update last-use time so normal stale-worktree cleanup won't reclaim an
  // actively resumed workspace.
  const now = new Date()
  await utimes(path, now, now)
  return path
}
