/**
 * Enumerate only addresses SendMessage can actually route through the team's
 * mailbox. Static Agent definitions are templates, not reachable sessions.
 * UDS / Remote Control discovery remains a separate transport responsibility.
 */
export function listReachableTeammates(teamFile, selfName) {
  if (!teamFile || !Array.isArray(teamFile.members)) return []
  const seen = new Set([selfName.toLowerCase()])
  const agents = []
  for (const member of teamFile.members) {
    const name = member?.name
    if (typeof name !== 'string' || !name.trim() || name.includes('@')) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    agents.push({ name, to: name, channel: 'team' })
  }
  return agents
}
