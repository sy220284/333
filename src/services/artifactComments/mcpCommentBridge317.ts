import { z } from 'zod/v4'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import type { ConnectedMCPServer } from '../mcp/types.js'
import { queryHaiku } from '../api/claude.js'
import { asSystemPrompt } from '../../utils/systemPromptType.js'
import { extractTextContent } from '../../utils/messages.js'
import { getClaudeConfigHomeDir, isEnvTruthy } from '../../utils/envUtils.js'
import {
  processArtifactComment317,
  type CommentEvent317,
  type CommentBackend317,
  type CommentCompletion317,
  type CommentEventLease317,
  type CommentThread317,
  type CommentPage317,
} from './commentPipeline317.js'

const EventSchema317 = z.object({
  method: z.literal('notifications/claude/artifact/comment'),
  params: z.object({
    event_id: z.string().min(1).max(180),
    artifact_url: z.string().url().startsWith('https://'),
    thread_id: z.string().min(1).max(180),
    trigger: z.enum(['new', 'activation', 'moved', 'redesignated']),
  }),
})

export const ArtifactCommentNotificationSchema317 = EventSchema317

function jsonResult(result: unknown): Record<string, unknown> {
  if (!result || typeof result !== 'object') throw new Error('Artifact provider returned an invalid response')
  const response = result as {
    isError?: boolean; structuredContent?: unknown; content?: unknown[]
  }
  if (response.isError) throw new Error('Artifact provider returned a tool error')
  let value: unknown = response.structuredContent
  if (value === undefined && Array.isArray(response.content)) {
    const text = response.content
      .filter((block): block is {type: string; text: string} =>
        !!block && typeof block === 'object' && 'type' in block &&
        block.type === 'text' && 'text' in block && typeof block.text === 'string')
      .map(block => block.text).join('')
    value = JSON.parse(text)
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Artifact provider response must be an object')
  }
  return value as Record<string, unknown>
}

function asString(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string' || value.length > max) {
    throw new Error('Artifact provider returned invalid ' + field)
  }
  return value
}

export function buildArtifactMcpBackend317(
  server: ConnectedMCPServer,
  toolName: string,
  approveWrite: (event: CommentEvent317) => Promise<boolean>,
): CommentBackend317 {
  async function call(event: CommentEvent317, action: string, fields: Record<string, unknown>) {
    const result = await server.client.callTool({
      name: toolName,
      arguments: { action, url: event.artifactUrl, ...fields },
    })
    return jsonResult(result)
  }
  return {
    async readThread(event) {
      const info = await call(event, 'comments', {thread_id:event.threadId})
      const thread = (info.thread ?? info) as Record<string, unknown>
      const active = thread && typeof thread === 'object' ? thread : {}
      return {
        body: asString(active.body, 'thread body', 64000),
        newestHumanRequest: asString(active.newestHumanRequest, 'human comment', 16000),
        summonedByEditor: active.summonedByEditor === true,
        originVerified: active.originVerified === true,
        resolved: active.resolved === true,
      } satisfies CommentThread317
    },
    async readPage(event) {
      const info = await call(event, 'read_page_data', {})
      if (info.available === false) return null
      return {
        html: asString(info.html, 'page HTML', 5_000_000),
        revision: asString(info.revision, 'page revision', 180),
        editable: info.editable === true,
        pinned: info.pinned === true,
      } satisfies CommentPage317
    },
    async publish(event, html, expectedRevision) {
      if (!await approveWrite(event)) throw new Error('Artifact edit is not authorized by this session')
      await call(event, 'publish', { html, expected_revision: expectedRevision })
    },
    async reply(event, text) {
      if (!await approveWrite(event)) throw new Error('Artifact reply is not authorized by this session')
      await call(event, 'reply', { thread_id:event.threadId, text })
    },
  }
}

export function createArtifactCommentModel317(
  signal: AbortSignal,
): CommentCompletion317 {
  return async (systemPrompt, userPrompt) => {
    const result = await queryHaiku({
      systemPrompt: asSystemPrompt([systemPrompt]),
      userPrompt,
      signal,
      options: {
        querySource: systemPrompt.includes('comment-thread analyst')
          ? 'artifact_comment_analyst'
          : 'artifact_comment_reply',
        agents: [],
        isNonInteractiveSession: true,
        hasAppendSystemPrompt: false,
        mcpTools: [],
        enablePromptCaching: false,
      },
    })
    return extractTextContent(result.message.content).trim()
  }
}

type LeaseStore = { done: string[] }

export function artifactEventLease317(
  serverId: string,
): CommentEventLease317 {
  const key = serverId.replace(/[^a-z0-9_-]/gi, '_').slice(0, 120)
  const dir = join(getClaudeConfigHomeDir(), 'artifact-comment-events')
  const path = join(dir, key + '.json')
  const claimed = new Set<string>()
  let done: Set<string> | undefined

  async function load(): Promise<Set<string>> {
    if (done) return done
    try {
      const parsed = JSON.parse(await readFile(path, 'utf8')) as LeaseStore
      if (!Array.isArray(parsed.done)) throw new Error('Invalid artifact event ledger')
      done = new Set(parsed.done.filter(x=>typeof x==='string' && x.length <= 180))
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
      done = new Set()
    }
    return done
  }
  return {
    async claim(id) {
      const ledger = await load()
      if (ledger.has(id) || claimed.has(id)) return false
      claimed.add(id)
      return true
    },
    async complete(id) {
      if (!claimed.has(id)) throw new Error('Artifact event completion has no active lease')
      const ledger = await load()
      ledger.add(id)
      await mkdir(dir, { recursive: true, mode: 0o700 })
      const temp = path + '.' + randomUUID() + '.tmp'
      await writeFile(temp, JSON.stringify({done: [...ledger].slice(-500)}),
        { flag:'wx', mode:0o600 })
      await rename(temp, path)
      claimed.delete(id)
    },
    async release(id) { claimed.delete(id) },
  }
}

export function registerArtifactCommentNotifications317(args: {
  server: ConnectedMCPServer
  toolName: string
  allowedDomain: string
  approveWrite: (event: CommentEvent317) => Promise<boolean>
  notifyError: (message: string) => void
  signal: AbortSignal
}): boolean {
  if (!isEnvTruthy(process.env.CLAUDE_CODE_EXPERIMENTAL_ARTIFACT_COMMENTS) ||
      !args.server.capabilities?.experimental?.['claude/artifact-comments']) return false
  if (!args.toolName.trim() || !args.allowedDomain.trim()) {
    throw new Error('Artifact event provider needs a tool and trusted artifact domain')
  }
  const backend = buildArtifactMcpBackend317(args.server, args.toolName, args.approveWrite)
  const model = createArtifactCommentModel317(args.signal)
  const lease = artifactEventLease317(args.server.name)
  args.server.client.setNotificationHandler(EventSchema317, async notification => {
    const event: CommentEvent317 = {
      eventId: notification.params.event_id,
      artifactUrl: notification.params.artifact_url,
      threadId: notification.params.thread_id,
      trigger: notification.params.trigger,
    }
    const url = new URL(event.artifactUrl)
    if (url.hostname !== args.allowedDomain || url.username || url.password ||
        url.port || args.signal.aborted) {
      args.notifyError('Artifact comment from an untrusted origin was rejected')
      return
    }
    try {
      await processArtifactComment317(event, backend, model, lease)
    } catch (error) {
      args.notifyError('Artifact comment processing failed: ' +
        (error instanceof Error ? error.message : String(error)))
    }
  })
  return true
}
