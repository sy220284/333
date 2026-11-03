/**
 * MCP skill discovery from the resources protocol.
 *
 * Each skill:// resource is exposed as a normal Skill command.  Its contents
 * are read only when invoked, keeping discovery lightweight and ensuring
 * resources/list_changed invalidates the same cache as MCP commands.
 */
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import type { Resource } from '@modelcontextprotocol/sdk/types.js'
import type { Command } from '../types/command.js'
import type { MCPServerConnection, ConnectedMCPServer } from '../services/mcp/types.js'
import { normalizeNameForMCP } from '../services/mcp/normalization.js'
import { memoizeWithLRU } from '../utils/memoize.js'

const MAX_RESOURCE_PAGES = 100
const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])

export function isSkillResource(resource: Resource): boolean {
  try {
    const url = new URL(resource.uri)
    return url.protocol === 'skill:' && Boolean(url.hostname || url.pathname.replaceAll('/', ''))
  } catch {
    return false
  }
}

function commandNameForResource(serverName: string, resource: Resource): string {
  const resourceName = normalizeNameForMCP(resource.name).replace(/^_+|_+$/g, '')
  if (!resourceName) {
    throw new Error(`MCP skill has no valid name: ${resource.uri}`)
  }
  return `mcp__${normalizeNameForMCP(serverName)}__${resourceName}`
}

/** Do not treat arbitrary binary data as UTF-8 or smuggle it into the prompt. */
export async function readMcpSkillResource(
  client: ConnectedMCPServer,
  uri: string,
): Promise<ContentBlockParam[]> {
  const result = await client.client.readResource({ uri })
  if (result.contents.length === 0) {
    throw new Error(`MCP skill resource returned no content: ${uri}`)
  }
  return result.contents.map(item => {
    if ('text' in item) {
      return { type: 'text' as const, text: item.text }
    }
    if ('blob' in item) {
      const mimeType = item.mimeType?.toLowerCase().split(';')[0]?.trim() ?? ''
      if (mimeType.startsWith('text/')) {
        return { type: 'text' as const, text: Buffer.from(item.blob, 'base64').toString('utf8') }
      }
      if (IMAGE_MIME_TYPES.has(mimeType)) {
        return {
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: mimeType as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
            data: item.blob,
          },
        }
      }
      throw new Error(`Unsupported MCP skill resource MIME type: ${mimeType || 'unspecified'} (${uri})`)
    }
    throw new Error(`Unsupported MCP skill resource content: ${uri}`)
  })
}

export async function discoverMcpSkills(client: MCPServerConnection): Promise<Command[]> {
  if (client.type !== 'connected' || !client.capabilities.resources) return []
  const discovered: Command[] = []
  const seenNames = new Set<string>()
  const seenUris = new Set<string>()
  const seenCursors = new Set<string>()
  let cursor: string | undefined

  for (let page = 0; page < MAX_RESOURCE_PAGES; page++) {
    const result = await client.client.listResources(cursor ? { cursor } : undefined)
    for (const resource of result.resources) {
      if (!isSkillResource(resource) || seenUris.has(resource.uri)) continue
      const name = commandNameForResource(client.name, resource)
      if (seenNames.has(name)) {
        throw new Error(`MCP skill name collision for server ${client.name}: ${name}`)
      }
      seenNames.add(name)
      seenUris.add(resource.uri)
      discovered.push({
        type: 'prompt',
        name,
        description: resource.description ?? '',
        hasUserSpecifiedDescription: Boolean(resource.description),
        contentLength: 0,
        source: 'mcp',
        loadedFrom: 'mcp',
        isMcp: true,
        progressMessage: 'running',
        userFacingName: () => `${client.name}:${resource.name} (MCP)`,
        async getPromptForCommand(): Promise<ContentBlockParam[]> {
          // A disconnected MCP client may reconnect between discovery and use.
          // Use the existing central connection lifecycle instead of reviving
          // an old transport or retrying a side-effecting call here.
          const { ensureConnectedClient } = await import('../services/mcp/client.js')
          const connected = await ensureConnectedClient(client)
          return readMcpSkillResource(connected, resource.uri)
        },
      })
    }
    if (!result.nextCursor) return discovered
    if (seenCursors.has(result.nextCursor)) {
      throw new Error(`MCP resources/list repeated cursor on server ${client.name}`)
    }
    seenCursors.add(result.nextCursor)
    cursor = result.nextCursor
  }
  throw new Error(`MCP resources/list exceeded ${MAX_RESOURCE_PAGES} pages on server ${client.name}`)
}

export const fetchMcpSkillsForClient = memoizeWithLRU(
  discoverMcpSkills,
  (client: MCPServerConnection) => client.name,
  100,
)
