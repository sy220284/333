/** Team mailbox recipients are distinct from static agent templates. */
export type TeamMember317 = {name?: string; agentId?: string; agentType?: string}
export type TeamRecipient317 = {
  name: string
  to: string
  channel: 'team'
  type?: string
  status?: string
}
export type AgentListEntry317 = {
  name?: string
  id?: string
  ref?: string
  type?: string
  kind?: string
  status?: string
  unreachableFromHere?: boolean
  acceptsPeerMessages?: boolean
}
export type AgentListingOptions317 = {
  self?: string
  subagents?: AgentListEntry317[]
  teammates?: AgentListEntry317[]
  sessions?: AgentListEntry317[]
  query?: string
  localUnreadable?: boolean
  accountNotes?: Array<{ kind: string; text: string }>
  canSend?: boolean
}
export type AgentListingResult317 = {
  listing: string
  sections: Array<{
    kind: string
    total: number
    rows: Array<{
      name?: string
      ref?: string
      id?: string
      type?: string
      status?: string
    }>
  }>
  notes: Array<{kind: string; text: string}>
}
type InProcessTeammateTask317 = {
  type: 'in_process_teammate'; identity: {agentId: string};
  isIdle?: boolean; status: string
}
function isInProcessTeammateTask317(value: unknown): value is InProcessTeammateTask317 {
  if (!value || typeof value !== 'object') return false
  const task = value as Partial<InProcessTeammateTask317>
  return task.type === 'in_process_teammate' &&
    typeof task.identity?.agentId === 'string' && typeof task.status === 'string'
}
export function listReachableTeammates(
  teamFile: {members?: TeamMember317[]} | null | undefined,
  selfName: string,
  liveTeammates: Record<string, TeamMember317> = {},
  tasks: Record<string, unknown> = {},
): TeamRecipient317[] {
  const seen = new Set([selfName.toLowerCase()])
  const agents: TeamRecipient317[] = []
  // Official 2.1.310 reads in-process teammate status from running tasks,
  // not from the persisted roster, which may lag or contain stale status.
  const taskStatuses = new Map<string, string>()
  for (const task of Object.values(tasks)) {
    if (!isInProcessTeammateTask317(task)) continue
    taskStatuses.set(task.identity.agentId, task.isIdle ? 'idle' : task.status)
  }
  const include = (member: TeamMember317 | undefined, agentId: string | undefined): void => {
    const name = member?.name
    if (typeof name !== 'string' || !name.trim() || name.includes('@')) return
    const key = name.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    // The saved roster can retain "running" after a worker exits. The
    // in-process task registry is the only authoritative status source.
    const status = agentId ? taskStatuses.get(agentId) : undefined
    agents.push({ name, to: name, channel: 'team',
      ...(member.agentType ? { type: member.agentType } : {}),
      ...(status ? { status } : {}) })
  }
  // Current in-process registry has precedence over the saved roster.
  for (const [agentId, member] of Object.entries(liveTeammates ?? {})) include(member, agentId)
  for (const member of Array.isArray(teamFile?.members) ? teamFile.members : []) include(member, member.agentId)
  return agents
}
/** A teammate still has a local_agent task, but must not claim the same
 * human-readable name in both sections of the official ListAgents listing. */
export function hideTeammateNamesInSubagents(
  subagents: Array<{name?: string; [key: string]: unknown}>,
  liveTeammates: ReadonlyArray<{name?: string}> | Record<string, {name?: string}> = {},
): { [key: string]: unknown; name?: string; }[] {
  const teammateNames = new Set(Object.values(liveTeammates ?? {}).map(t => t.name))
  return subagents.map(agent => teammateNames.has(agent.name)
    ? { ...agent, name: undefined } : agent)
}
/** Text and structured output are produced from the same filtered records. */
export function buildAgentListing({
  self, subagents = [], teammates = [], sessions = [], query,
  localUnreadable = false, accountNotes = [], canSend = true,
}: AgentListingOptions317): AgentListingResult317 {
  const q = query?.trim().toLowerCase()
  const matches = (item: AgentListEntry317): boolean => !q || [item.name, item.id, item.type, item.kind, item.status].some(value => String(value ?? '').toLowerCase().includes(q))
  const groups = [
    { kind: 'subagents', title: 'Subagents', values: subagents.filter(matches) },
    { kind: 'teammates', title: 'Teammates', values: teammates.filter(matches) },
    { kind: 'sessions', title: 'Peer sessions', values: sessions.filter(matches) },
  ]
  const sections: AgentListingResult317['sections'] = []
  const paragraphs: string[] = []
  for (const group of groups) {
    if (!group.values.length) continue
    const rows = group.values.slice(0, 100).map(item => {
      const title = item.ref ? `${item.name} [${item.ref}]` : item.name ?? item.id
      const displayStatus = item.status === 'requires_action' ? 'waiting on a human' : item.status
      const meta = [item.type ?? item.kind, displayStatus,
        item.unreachableFromHere ? 'not reachable from here' : undefined,
        item.acceptsPeerMessages === false ? 'does not accept peer messages' : undefined].filter(Boolean)
      return { text: `  ${title}${meta.length ? `  ·  ${meta.join('  ·  ')}` : ''}`,
        value: { name: item.name, ref: item.ref, id: item.id, type: item.type ?? item.kind, status: item.status } }
    })
    sections.push({ kind: group.kind, total: group.values.length, rows: rows.map(r => r.value) })
    paragraphs.push(`${group.title} (${group.values.length}):\n${rows.map(r => r.text).join('\n')}`)
  }
  const notes = localUnreadable ? [{
    kind: 'local_list_failed',
    text: '(the session list on this machine could not be read just now — other local sessions may be missing from this listing; a later listing retries)',
  }] : []
  notes.push(...accountNotes)
  if (!canSend && sections.length) paragraphs.unshift('None of the agents below can be messaged with SendMessage from here.')
  const own = self ? `This session is ${self} — the name other sessions use to message it (it is not listed below; a message to it would be a message to yourself).` : ''
  if (notes.length) paragraphs.push(...notes.map(note => note.text))
  if (!paragraphs.length) paragraphs.push(own
    ? canSend
      ? 'No reachable agents — no other Claude session is running on this machine right now (peer messaging itself is available; a session appears here once it is started).'
      : 'No reachable agents — no other Claude session is running on this machine right now.'
    : 'No reachable agents.')
  return { listing: [own, ...paragraphs].filter(Boolean).join('\n\n'), sections, notes }
}
