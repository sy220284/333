/**
 * Verify actual provider tool-call and streaming behavior with two small
 * remote requests. Never runs during ordinary startup: probes may incur cost.
 * Existing project/system prompts are not read or modified.
 */
import { randomUUID } from 'node:crypto'
import { promises as fs, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getIndependentApiKey, resolveIndependentModel } from './registry.js'
import { getChatGPTAuthorization } from '../../auth/chatgptOAuth.js'
import { makeIndependentFetch } from './transport.js'
import { getModelStorageRoot } from './storage.js'
type CapabilityReport = {
  model: string
  provider: string
  protocol: string
  timestamp: string
  latencyMs: number
  stream: boolean
  toolCalling: boolean
  toolRoundTrip: boolean
  details?: string
}
const reportsFile = () => join(getModelStorageRoot(), 'capabilities.json')
function readReports(): CapabilityReport[] {
  try {
    const data = JSON.parse(readFileSync(reportsFile(),'utf8'))
    if (!Array.isArray(data)) throw new Error('Invalid capability report storage')
    return data as CapabilityReport[]
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}
export function getSavedCapabilityReport(model: string): CapabilityReport | undefined {
  return readReports().find(item => item.model === model)
}
async function persist(report: CapabilityReport): Promise<void> {
  const directory = getModelStorageRoot()
  const path = join(directory, 'capabilities.json')
  await fs.mkdir(directory, { recursive: true, mode: 0o700 })
  const list = readReports().filter(item => item.model !== report.model)
  list.push(report)
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    await fs.writeFile(temporary,JSON.stringify(list,null,2),{encoding:'utf8',mode:0o600,flag:'wx'})
    await fs.rename(temporary,path)
    await fs.chmod(path,0o600)
  } finally { await fs.rm(temporary,{force:true}) }
}
type ProbeResult = {
  stream: boolean
  tool: boolean
  roundTrip: boolean
  details?: string
}
type ProbeEvent = {
  type?: string
  index?: number
  content_block?: { name?: string; id?: string }
  delta?: { type?: string; partial_json?: string; text?: string; stop_reason?: string }
}
function parseStream(text: string): ProbeEvent[] {
  return text.split(/\r?\n/).filter(row => row.startsWith('data: '))
    .map(row => row.slice(6).trim()).filter(row => row && row !== '[DONE]')
    .map(row => JSON.parse(row) as ProbeEvent)
}
function inspectToolRequest(text: string): ProbeResult & { toolId?: string } {
  const events = parseStream(text)
  if (!events.some(e => e.type === 'message_start') || !events.some(e => e.type === 'message_stop')) {
    return { stream: false, tool: false, roundTrip: false, details: 'Incomplete first streaming response' }
  }
  const start = events.find(e => e.type === 'content_block_start' && e.content_block?.name === 'avenlo_probe')
  if (!start) return { stream: true, tool: false, roundTrip: false, details: 'Model did not invoke requested tool' }
  const toolId = start.content_block?.id
  if (typeof toolId !== 'string' || !toolId) {
    return { stream: true, tool: true, roundTrip: false, details: 'Tool invocation is missing an ID' }
  }
  const input = events.filter(e => e.type === 'content_block_delta' &&
    e.index === start.index && e.delta?.type === 'input_json_delta')
    .map(e => e.delta.partial_json).join('')
  let value: unknown
  try { value = JSON.parse(input) }
  catch { return { stream: true, tool: true, roundTrip: false, details: 'Incomplete tool argument JSON' } }
  if (typeof value !== 'object' || value === null || (value as { ok?: unknown }).ok !== true) {
    return { stream: true, tool: true, roundTrip: false, details: 'Tool arguments failed validation' }
  }
  return { stream: true, tool: true, roundTrip: false, toolId }
}

/** Verify the tool result is accepted in the next turn; a tool call alone is insufficient. */
export async function runModelToolRoundTrip(
  model: string,
  send: (request: Record<string, unknown>) => Promise<string>,
  toolSelection: 'named' | 'auto' = 'named',
): Promise<ProbeResult> {
  const body = {
    model,
    system: [{ type: 'text', text: 'Compatibility test. Call avenlo_probe with ok=true; after its tool result, respond with exactly PROBE_OK.' }],
    messages: [{ role: 'user', content: 'Call avenlo_probe({ok:true}) now.' }],
    max_tokens: 256,
    stream: true,
    // Some reasoning providers accept only auto tool selection. The test
    // must exercise their real wire semantics, not request an invalid override.
    tool_choice: toolSelection === 'named'
      ? { type: 'tool', name: 'avenlo_probe' } : { type: 'auto' },
    tools: [{ name: 'avenlo_probe', description: 'Validate tool round-trip',
      input_schema: { type: 'object', properties: { ok: { type: 'boolean' } },
        required: ['ok'], additionalProperties: false } }],
  }
  const first = inspectToolRequest(await send(body))
  if (!first.toolId) return first
  const followUp = {
    ...body,
    tool_choice: { type: 'auto' },
    messages: [
      ...body.messages,
      { role: 'assistant', content: [{ type: 'tool_use', id: first.toolId,
        name: 'avenlo_probe', input: { ok: true } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: first.toolId,
        content: 'Tool succeeded. Respond with PROBE_OK.' }] },
    ],
  }
  const events = parseStream(await send(followUp))
  const complete = events.some(e => e.type === 'message_start') &&
    events.some(e => e.type === 'message_stop') &&
    events.some(e => e.type === 'message_delta' && e.delta?.stop_reason === 'end_turn')
  const output = events.filter(e => e.type === 'content_block_delta' &&
    e.delta?.type === 'text_delta').map(e => e.delta.text).join('')
  if (!complete || !output.includes('PROBE_OK')) {
    return { stream: true, tool: true, roundTrip: false,
      details: 'Tool result was not followed by a completed PROBE_OK reply' }
  }
  return { stream: true, tool: true, roundTrip: true }
}

export async function verifyIndependentModel(model: string): Promise<CapabilityReport> {
  const route = resolveIndependentModel(model)
  if (!route) throw new Error('Expected model ID in provider/model format')
  const authorization = route.provider === 'chatgpt'
    ? await getChatGPTAuthorization() : undefined
  const bearer = authorization?.token ?? getIndependentApiKey(route)
  // Replay identity must survive access-token rotation without crossing
  // another ChatGPT account/workspace boundary.
  const http = makeIndependentFetch(route, bearer, fetch, undefined, authorization?.account ?? bearer)
  const send = async (body: Record<string, unknown>): Promise<string> => {
    const request = new Request('https://avenlo-model-bridge.invalid/v1/messages', {
      method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
    })
    const response = await http(request, { signal: AbortSignal.timeout(30000) })
    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Capability probe ${route.provider} HTTP ${response.status}: ${error.slice(0,350)}`)
    }
    const text = await response.text()
    if (text.length > 1_000_000) throw new Error('Capability probe response exceeded limit')
    return text
  }
  const begin = Date.now()
  // DeepSeek reasoning mode and Kimi K2 direct APIs cannot guarantee a
  // named tool choice. Validate that the model actually chooses and completes
  // the tool round trip; never rewrite a real user's hard constraint.
  const toolSelection = route.provider === 'deepseek' ||
    (route.provider === 'kimi' && /^kimi-k2(?:[.-]|$)/i.test(route.model))
    ? 'auto' : 'named'
  const result = await runModelToolRoundTrip(model, send, toolSelection)
  const report: CapabilityReport = {
    model, provider: route.provider, protocol: route.protocol,
    timestamp: new Date().toISOString(), latencyMs: Date.now() - begin,
    stream: result.stream, toolCalling: result.tool, toolRoundTrip: result.roundTrip,
    ...(result.details ? { details: result.details } : {}),
  }
  await persist(report)
  return report
}
