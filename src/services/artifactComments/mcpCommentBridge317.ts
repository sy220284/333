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
      const listed = Array.isArray(info.threads)
        ? info.threads.find(item => !!item && typeof item === 'object' &&
          'id' in item && item.id === event.threadId)
        : null
      const thread = (listed ?? info.thread ?? info) as Record<string, unknown>
      const active = thread && typeof thread === 'object' ? thread : {}
      const comments = Array.isArray(active.comments)
        ? active.comments.filter((item): item is Record<string, unknown> =>
          !!item && typeof item === 'object')
        : []
      const newestHuman = [...comments].reverse().find(comment =>
        comment.postedByArtifact !== true &&
        (comment.sentByViewer === true || comment.isHuman === true))
      const text = newestHuman?.text ?? newestHuman?.body ??
        active.newestHumanRequest
      return {
        body: typeof active.body === 'string'
          ? asString(active.body, 'thread body', 64000)
          : JSON.stringify(comments).slice(0, 64000),
        newestHumanRequest: asString(text, 'human comment', 16000),
        summonedByEditor: active.summonedByEditor === true ||
          (active.claudeActivated === true &&
           comments.some(comment => comment.sentByViewer === true)),
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
      const receipt = await call(event, 'publish', { html, expected_revision: expectedRevision })
      if (receipt.published !== true && receipt.success !== true &&
          receipt.status !== 'published') {
        throw new Error('Artifact publish outcome is unverified; manual review required')
      }
    },
    async reply(event, text) {
      if (!await approveWrite(event)) throw new Error('Artifact reply is not authorized by this session')
      const receipt = await call(event, 'reply', { thread_id:event.threadId, text })
      if (receipt.posted !== true && receipt.success !== true &&
          receipt.status !== 'posted') {
        throw new Error('Artifact reply outcome is unverified; manual review required')
      }
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

type LeaseStore = { done: string[]; published?: Record<string, string> }

export function artifactEventLease317(
  serverId: string,
): CommentEventLease317 {
  const key = serverId.replace(/[^a-z0-9_-]/gi, '_').slice(0, 120)
  const dir = join(getClaudeConfigHomeDir(), 'artifact-comment-events')
  const path = join(dir, key + '.json')
  const claimed = new Set<string>()
  let done: Set<string> | undefined
  let published = new Map<string, string>()

  async function load(): Promise<Set<string>> {
    if (done) return done
    try {
      const parsed = JSON.parse(await readFile(path, 'utf8')) as LeaseStore
      if (!Array.isArray(parsed.done)) throw new Error('Invalid artifact event ledger')
      done = new Set(parsed.done.filter(x=>typeof x==='string' && x.length <= 180))
      published = new Map(Object.entries(parsed.published ?? {})
        .filter(([id, text]) => id.length <= 180 &&
          typeof text === 'string' && text.length <= 4000))
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
      done = new Set()
    }
    return done
  }
  async function persist() {
    await mkdir(dir, { recursive: true, mode: 0o700 })
    const temp = path + '.' + randomUUID() + '.tmp'
    await writeFile(temp, JSON.stringify({
      done: [...(await load())].slice(-500),
      published: Object.fromEntries(published),
    }), { flag:'wx', mode:0o600 })
    await rename(temp, path)
  }
  return {
    async getPublishedReply(id) {
      await load()
      return published.get(id) ?? null
    },
    async markPublished(id, reply) {
      if (!claimed.has(id)) throw new Error('Artifact published event lacks an active lease')
      await load()
      published.set(id, reply)
      await persist()
    },
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
      published.delete(id)
      await persist()
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
  args.server.client.setNotificationHandler(
    'notifications/claude/artifact/comment',
    { params: EventSchema317.shape.params },
    async notification => {
    const params = EventSchema317.shape.params.parse(notification)
    const event: CommentEvent317 = {
      eventId: params.event_id,
      artifactUrl: params.artifact_url,
      threadId: params.thread_id,
      trigger: params.trigger,
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
    },
  )
  return true
}
