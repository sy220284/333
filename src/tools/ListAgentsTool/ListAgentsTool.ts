import { basename, join } from 'node:path'
import { z } from 'zod/v4'
import { getOriginalCwd, getSessionId } from '../../bootstrap/state.js'
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
import { buildAgentListing, listReachableTeammates } from './peerListing.mjs'

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
  async description() { return 'List reachable agents and Claude sessions, including teammates and other local sessions.' },
  async prompt() { return 'Lists agents you can SendMessage to. Copy the row name exactly; append [ref] for ambiguous names. Optional channel and q arguments may be omitted.' },
  get inputSchema(): InputSchema { return inputSchema() },
  get outputSchema(): OutputSchema { return outputSchema() },
  isEnabled() { return isCrossSessionMessagingEnabled() },
  isReadOnly() { return true },
  isConcurrencySafe() { return true },
  async validateInput() { return { result: true as const } },
  renderToolUseMessage() { return null },
  async call(input, { getAppState }) {
    const state = getAppState()
    const teamName = getTeamName(state.teamContext)
    const selfName = isAgentSwarmsEnabled() && teamName ? getAgentName() || TEAM_LEAD_NAME : ''
    const teamFile = teamName ? await readTeamFileAsync(teamName) : null
    const teammates = listReachableTeammates(teamFile, selfName)
    const { peers: localSessions, unreadable } = await listLiveLocalPeers(join(getClaudeConfigHomeDir(), 'sessions'))
    const account = await discoverAuthenticatedPeers(localSessions)
    rememberAccountRecipients(account.peers)
    const sessions = [...localSessions, ...account.peers]
    const ownSocket = process.env.CLAUDE_CODE_MESSAGING_SOCKET
    const ownName = process.env.CLAUDE_CODE_SESSION_NAME || basename(getOriginalCwd()) || 'Claude session'
    const self = ownSocket ? `${ownName} [${peerRef(ownSocket)}]` : `${ownName} [${getSessionId().slice(0, 6)}]`
    const subagents = Object.values(state.tasks).flatMap(task => {
      if (task?.type !== 'local_agent' || task.agentType === 'main-session') return []
      return [{ id: task.id,
        name: [...state.agentNameRegistry.entries()].find(([, agentId]) => agentId === task.id)?.[0],
        type: task.agentType, status: task.status }]
    })
    return { data: buildAgentListing({
      self, subagents, teammates, sessions, query: input.q, localUnreadable: unreadable,
      accountNotes: account.notes, canSend: true,
    }) }
  },
  mapToolResultToToolResultBlockParam(content: Output, toolUseID: string) {
    return { type: 'tool_result' as const, tool_use_id: toolUseID, content: content.listing }
  },
} satisfies ToolDef<InputSchema, Output>)
