/** Team mailbox recipients are distinct from static agent templates. */
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
    agents.push({ name, to: name, channel: 'team', ...(member.agentType ? { type: member.agentType } : {}) })
  }
  return agents
}
/** Text and structured output are produced from the same filtered records. */
export function buildAgentListing({ self, subagents = [], teammates = [], sessions = [], query, localUnreadable = false, accountNotes = [], canSend = true }) {
  const q = query?.trim().toLowerCase()
  const matches = item => !q || [item.name, item.id, item.type, item.kind, item.status].some(value => String(value ?? '').toLowerCase().includes(q))
  const groups = [
    { kind: 'subagents', title: 'Subagents', values: subagents.filter(matches) },
    { kind: 'teammates', title: 'Teammates', values: teammates.filter(matches) },
    { kind: 'sessions', title: 'Peer sessions', values: sessions.filter(matches) },
  ]
  const sections = [], paragraphs = []
  for (const group of groups) {
    if (!group.values.length) continue
    const rows = group.values.slice(0, 100).map(item => {
      const title = item.ref ? `${item.name} [${item.ref}]` : item.name ?? item.id
      const meta = [item.type ?? item.kind, item.status,
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
