/**
 * Team Discovery - Utilities for discovering teams and teammate status
 *
 * Scans ~/.claude/teams/ to find teams where the current session is the leader.
 * Used by the Teams UI in the footer to show team status.
 */

import { readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { getTeamsDir } from './envUtils.js'
import { TEAM_LEAD_NAME } from './swarm/constants.js'
import { isPaneBackend, type PaneBackendType } from './swarm/backends/types.js'
import { readTeamFile } from './swarm/teamHelpers.js'

export type TeamSummary = {
  name: string
  memberCount: number
  runningCount: number
  idleCount: number
}

export type TeammateStatus = {
  name: string
  agentId: string
  agentType?: string
  model?: string
  prompt?: string
  status: 'running' | 'idle' | 'unknown'
  color?: string
  idleSince?: string // ISO timestamp from idle notification
  tmuxPaneId: string
  cwd: string
  worktreePath?: string
  isHidden?: boolean // Whether the pane is currently hidden from the swarm view
  backendType?: PaneBackendType // The backend type used for this teammate
  mode?: string // Current permission mode for this teammate
}

/**
 * Get detailed teammate statuses for a team
 * Reads isActive from config to determine status
 */
export function getTeammateStatuses(teamName: string): TeammateStatus[] {
  const teamFile = readTeamFile(teamName)
  if (!teamFile) {
    return []
  }

  const hiddenPaneIds = new Set(teamFile.hiddenPaneIds ?? [])
  const statuses: TeammateStatus[] = []

  for (const member of teamFile.members) {
    // Exclude team-lead from the list
    if (member.name === 'team-lead') {
      continue
    }

    // Read isActive from config, defaulting to true (active) if undefined
    const isActive = member.isActive !== false
    const status: 'running' | 'idle' = isActive ? 'running' : 'idle'

    statuses.push({
      name: member.name,
      agentId: member.agentId,
      agentType: member.agentType,
      model: member.model,
      prompt: member.prompt,
      status,
      color: member.color,
      tmuxPaneId: member.tmuxPaneId,
      cwd: member.cwd,
      worktreePath: member.worktreePath,
      isHidden: hiddenPaneIds.has(member.tmuxPaneId),
      backendType:
        member.backendType && isPaneBackend(member.backendType)
          ? member.backendType
          : undefined,
      mode: member.mode,
    })
  }

  return statuses
}

// Note: For time formatting, use formatRelativeTimeAgo from '../utils/format.js'

/** Discover independent teams owned by sessions in the same project.
 * The team name is informational; messaging still targets an active session.
 */
export async function listProjectTeams(projectDir: string): Promise<TeamSummary[]> {
  let entries: import('node:fs').Dirent[]
  try { entries = await readdir(getTeamsDir(), { withFileTypes: true }) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  const target = resolve(projectDir)
  const summaries: TeamSummary[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^[a-z0-9-]+$/.test(entry.name)) continue
    const team = readTeamFile(entry.name)
    if (!team || !team.members.some(member =>
      member.name === TEAM_LEAD_NAME && resolve(member.cwd) === target)) continue
    const members = team.members.filter(member => member.name !== TEAM_LEAD_NAME)
    summaries.push({
      name: team.name,
      memberCount: members.length,
      runningCount: members.filter(member => member.isActive !== false).length,
      idleCount: members.filter(member => member.isActive === false).length,
    })
  }
  return summaries.sort((a,b) => a.name.localeCompare(b.name))
}
