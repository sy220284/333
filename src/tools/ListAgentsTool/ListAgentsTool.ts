import { basename, join } from 'node:path'
import { z } from 'zod/v4'
import { getOriginalCwd } from '../../bootstrap/state.js'
import { buildTool, type ToolDef } from '../../Tool.js'
import { isAgentSwarmsEnabled } from '../../utils/agentSwarmsEnabled.js'
import { isCrossSessionMessagingEnabled } from '../../utils/crossSessionMessaging.js'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { listLiveLocalPeers, peerRef } from '../../utils/livePeerSessions.mjs'
import { TEAM_LEAD_NAME } from '../../utils/swarm/constants.js'
import { readTeamFileAsync } from '../../utils/swarm/teamHelpers.js'
import { getAgentName, getTeamName } from '../../utils/teammate.js'
import { discoverAuthenticatedPeers } from '../../bridge/peerDiscovery.js'
import { rememberAccountRecipients } from '../../utils/accountPeerDirectory.mjs'
import { getMessagingSocketPath } from '../../utils/udsMessaging.js'
import { buildAgentListing, hideTeammateNamesInSubagents, listReachableTeammates } from './peerListing.mjs'

const canSendMessage = (tools: readonly { name: string }[]): boolean =>
  tools.some(tool => tool.name === 'SendMessage')

const inputSchema = lazySchema(() => z.strictObject({
  channel: z.string().max(256).optional().describe('Not available in this build; leave unset.'),
  q: z.string().max(256).optional().describe('Not available in this build; leave unset.'),
}))
type InputSchema = ReturnType<typeof inputSchema>
const rowSchema = z.object({
  name: z.string().optional(), ref: z.string().optional(), id: z.string().optional(),
  type: z.string().optional(), status: z.string().optional(),
})
const outputSchema = lazySchema(() => z.object({
  listing: z.string(),
  sections: z.array(z.object({ kind: z.string(), total: z.number(), rows: z.array(rowSchema) })).optional(),
  notes: z.array(z.object({ kind: z.string(), text: z.string() })).optional(),
}))
type OutputSchema = ReturnType<typeof outputSchema>
type Output = z.infer<OutputSchema>

export const ListAgentsTool = buildTool({
  name: 'ListAgents',
  aliases: ['ListPeers'],
  searchHint: 'list agents you can SendMessage to',
  maxResultSizeChars: 10_000,
  userFacingName() { return 'ListAgents' },
  async description(_input, { tools }) { return canSendMessage(tools)
    ? 'List reachable agents and Claude sessions you can SendMessage to.'
    : 'List agents and Claude sessions; SendMessage is not available among your tools.' },
  async prompt({ tools }) { return canSendMessage(tools)
    ? 'Lists reachable agents you can SendMessage to. Copy the address exactly; append [ref] to disambiguate names.'
    : 'Lists agents and Claude sessions for information. SendMessage is unavailable in this tool context; listed addresses cannot be used for messaging.' },
  get inputSchema(): InputSchema { return inputSchema() },
  get outputSchema(): OutputSchema { return outputSchema() },
  isEnabled() { return isCrossSessionMessagingEnabled() },
  isReadOnly() { return true },
  isConcurrencySafe() { return true },
  async validateInput() { return { result: true as const } },
  renderToolUseMessage() { return null },
  async call(input, { getAppState, options }) {
    const state = getAppState()
    const teamName = getTeamName(state.teamContext)
    const selfName = isAgentSwarmsEnabled() && teamName ? getAgentName() || TEAM_LEAD_NAME : ''
    const teamFile = teamName ? await readTeamFileAsync(teamName) : null
    const teammates = listReachableTeammates(teamFile, selfName, state.teamContext?.teammates, state.tasks)
    const { peers: localSessions, unreadable } = await listLiveLocalPeers(join(getClaudeConfigHomeDir(), 'sessions'))
    const account = await discoverAuthenticatedPeers(localSessions)
    rememberAccountRecipients(account.peers, Date.now(), account.identityKey)
    const sessions = [...localSessions, ...account.peers]
    // Use the socket actually bound by this process, not a stale inherited env value.
    const ownSocket = getMessagingSocketPath()
    const ownName = process.env.CLAUDE_CODE_SESSION_NAME || basename(getOriginalCwd()) || 'Claude session'
    const self = ownSocket ? `${ownName} [${peerRef(ownSocket)}]` : undefined
    const subagents = Object.values(state.tasks).flatMap(task => {
      if (task?.type !== 'local_agent' || task.agentType === 'main-session') return []
      return [{ id: task.id,
        name: [...state.agentNameRegistry.entries()].find(([, agentId]) => agentId === task.id)?.[0],
        type: task.agentType, status: task.status }]
    })
    return { data: buildAgentListing({
      self, subagents: hideTeammateNamesInSubagents(subagents, state.teamContext?.teammates),
      teammates, sessions, query: input.q, localUnreadable: unreadable,
      accountNotes: account.notes,
      canSend: canSendMessage(options.refreshTools?.() ?? options.tools),
    }) }
  },
  mapToolResultToToolResultBlockParam(content: Output, toolUseID: string) {
    return { type: 'tool_result' as const, tool_use_id: toolUseID, content: content.listing }
  },
} satisfies ToolDef<InputSchema, Output>)
