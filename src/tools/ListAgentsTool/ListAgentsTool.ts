import { z } from 'zod/v4'
import { getSessionId } from '../../bootstrap/state.js'
import { buildTool, type ToolDef } from '../../Tool.js'
import { isAgentSwarmsEnabled } from '../../utils/agentSwarmsEnabled.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { TEAM_LEAD_NAME } from '../../utils/swarm/constants.js'
import { readTeamFileAsync } from '../../utils/swarm/teamHelpers.js'
import { getAgentName, getTeamName } from '../../utils/teammate.js'
import { listReachableTeammates } from './peerListing.mjs'

const inputSchema = lazySchema(() =>
  z.strictObject({
    channel: z.string().optional().describe('Unavailable in this build. Leave unset.'),
    q: z.string().optional().describe('Unavailable in this build. Leave unset.'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    self: z.object({ name: z.string(), sessionId: z.string() }),
    agents: z.array(z.object({
      name: z.string(), to: z.string(), channel: z.literal('team'),
    })),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>
type Output = z.infer<OutputSchema>

export const ListAgentsTool = buildTool({
  name: 'ListAgents',
  searchHint: 'find reachable sessions and team members for SendMessage',
  maxResultSizeChars: 100_000,
  userFacingName() { return 'ListAgents' },
  async description() {
    return 'Discover sessions reachable for cross-session messaging.'
  },
  async prompt() {
    return 'List currently reachable messaging recipients. Use the exact to address with SendMessage. The optional channel and q arguments are unavailable in this build and must be left unset.'
  },
  get inputSchema(): InputSchema { return inputSchema() },
  get outputSchema(): OutputSchema { return outputSchema() },
  isEnabled() { return true },
  isReadOnly() { return true },
  isConcurrencySafe() { return true },
  async validateInput(input) {
    if (input.channel !== undefined || input.q !== undefined) {
      return { result: false as const, message: 'channel and q are unavailable in this build; leave both unset', errorCode: 9 }
    }
    return { result: true as const }
  },
  renderToolUseMessage() { return null },
  async call(_input, { getAppState }) {
    const teamName = getTeamName(getAppState().teamContext)
    const hasTeamMessaging = isAgentSwarmsEnabled() && !!teamName
    const selfName = hasTeamMessaging ? getAgentName() || TEAM_LEAD_NAME : 'current-session'
    const teamFile = hasTeamMessaging ? await readTeamFileAsync(teamName) : null
    return {
      data: {
        self: { name: selfName, sessionId: getSessionId() },
        agents: listReachableTeammates(teamFile, selfName).map(({ name, to }) => ({
          name, to, channel: 'team' as const,
        })),
      },
    }
  },
  mapToolResultToToolResultBlockParam(content: Output, toolUseID: string) {
    const self = `Current session: ${content.self.name} (${content.self.sessionId})`
    const peers = content.agents.map(agent => `- ${agent.name} (SendMessage to: ${agent.to})`)
    return {
      type: 'tool_result' as const,
      tool_use_id: toolUseID,
      content: [self, peers.length ? peers.join('\n') : 'No other reachable sessions.'].join('\n'),
    }
  },
} satisfies ToolDef<InputSchema, Output>)
