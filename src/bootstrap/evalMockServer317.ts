import { createHash } from 'node:crypto'
import { open, lstat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { createConnection } from 'node:net'
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { Server } from "@modelcontextprotocol/server";

const MAX_SPEC_BYTES = 4_194_304
const MAX_FIXTURE_BYTES = 1_048_576
const MAX_RELAY_BYTES = 4_194_304
const MAX_OUTPUT_CHARS = 16_384
const ABORT_TEXT = 'eval aborted by mock'
const RELAY_FAILURE = 'mock agent responder failed'
const BLOCKED_OUTPUT = /^(?:eval aborted by mock|MCP server "|MCP error -32000: Connection closed)/

type ToolEntry = { name: string; description: string; inputSchema: Record<string, unknown> }
interface ExpectedMap317 { [key: string]: Expected }
type Expected = string | string[] | ExpectedMap317 | null
type FixedResponder = { kind: 'fixed'; body: string; isError: boolean; expect: Expected; baseDir: string }
type AgentResponder = { kind: 'agent'; prompt: string; abortWhen: string | null; expect: Expected;
  baseDir: string; replay: { mockHash: string; replayDir: string; pinned: Record<string, string> } }
type Responder = FixedResponder | AgentResponder
type MockSpec317 = { registeredName: string; server: string; nonce: string; callLogPath: string;
  tools: ToolEntry[]; responders: Record<string, Responder>;
  agent: null | { socketPath: string; token: string } }
type Verdict = { verdict: 'ok' | 'tool_error' | 'abort'; text: string; replay?: 'hit' | 'miss' }

function requireString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string') throw Error('eval mock spec: ' + label + ' must be a string')
}
function requireObject(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw Error('eval mock spec: ' + label + ' must be an object')
}
export function validateEvalMockSpec317(input: unknown): MockSpec317 {
  requireObject(input, 'root')
  for (const field of ['registeredName', 'server', 'nonce', 'callLogPath'])
    requireString(input[field], field)
  if (!Array.isArray(input.tools)) throw Error('eval mock spec: tools must be an array')
  for (const tool of input.tools) {
    requireObject(tool, 'tool')
    requireString(tool.name, 'tool.name')
    requireString(tool.description, 'tool.description')
    requireObject(tool.inputSchema, 'tool.inputSchema')
  }
  requireObject(input.responders, 'responders')
  for (const responder of Object.values(input.responders)) {
    requireObject(responder, 'responder')
    if (responder.kind !== 'agent' && responder.kind !== 'fixed')
      throw Error('eval mock spec: unknown responder kind')
    requireString(responder.baseDir, 'responder.baseDir')
    if (responder.kind === 'fixed') {
      requireString(responder.body, 'responder.body')
      if (typeof responder.isError !== 'boolean') throw Error('eval mock spec: isError must be boolean')
    } else {
      requireString(responder.prompt, 'responder.prompt')
      if (responder.abortWhen !== null) requireString(responder.abortWhen, 'responder.abortWhen')
      requireObject(responder.replay, 'responder.replay')
    }
  }
  if (input.agent !== null) {
    requireObject(input.agent, 'agent')
    requireString(input.agent.socketPath, 'agent.socketPath')
    requireString(input.agent.token, 'agent.token')
  }
  return input as MockSpec317
}

async function openRegular(path: string, limit: number, label: string): Promise<string> {
  const flags = constants.O_RDONLY | (process.platform === 'win32' ? 0 : constants.O_NONBLOCK | constants.O_NOFOLLOW)
  const fd = await open(path, flags)
  try {
    const stat = await fd.stat()
    if (!stat.isFile()) throw Error(label + ' path is not a regular file — refusing to read it')
    if (stat.size > limit) throw Error(label + ' file is over the size limit the harness writes — refusing to read it')
    const buffer = Buffer.alloc(stat.size)
    let position = 0
    while (position < buffer.length) {
      const { bytesRead } = await fd.read(buffer, position, buffer.length - position, position)
      if (bytesRead === 0) break
      position += bytesRead
    }
    return buffer.subarray(0, position).toString('utf8')
  } finally { await fd.close() }
}
async function recordLine(path: string, value: Record<string, unknown>): Promise<boolean> {
  try {
    const flags = constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT |
      (process.platform === 'win32' ? 0 : constants.O_NONBLOCK | constants.O_NOFOLLOW)
    const fd = await open(path, flags, 0o600)
    try {
      if (!(await fd.stat()).isFile()) return false
      const bytes = Buffer.from(JSON.stringify(value) + '\n')
      let offset = 0
      while (offset < bytes.length) {
        const { bytesWritten } = await fd.write(bytes, offset, bytes.length - offset)
        if (bytesWritten === 0) return false
        offset += bytesWritten
      }
      return true
    } finally { await fd.close() }
  } catch { return false }
}
function nested(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((v, key) =>
    v && typeof v === 'object' && Object.hasOwn(v, key)
      ? (v as Record<string, unknown>)[key] : undefined, value)
}
function shorten(value: string, max = MAX_OUTPUT_CHARS): string {
  return value.length > max ? value.slice(0, max) + '…[truncated]' : value
}
export function protectEvalMockText317(text: string): string {
  const trimmed = text.trimStart()
  return BLOCKED_OUTPUT.test(trimmed) ? '| ' + trimmed : text
}
function compareExpectedRules317(input: unknown, expected: Record<string, Expected>,
  prefix = ''): string | null {
  for (const [key, rule] of Object.entries(expected)) {
    const path = prefix ? prefix + '.' + key : key
    const value = nested(input, path)
    const printable = value === undefined ? '(missing)' : shorten(JSON.stringify(value), 80)
    if (Array.isArray(rule)) {
      if (rule.some(candidate => {
        if (typeof value === 'string') return value === candidate
        if (typeof value === 'boolean' || typeof value === 'number') return String(value) === candidate
        return false
      })) continue
      return path + ' = ' + printable + ' is not one of [' + rule.join(', ') + ']'
    }
    if (typeof rule === 'object' && rule !== null) {
      const failure = compareExpectedRules317(input, rule, path)
      if (failure) return failure
      continue
    }
    if (typeof rule !== 'string') return 'invalid expected guard at ' + path
    const regex = /^\/(.+)\/([a-z]*)$/s.exec(rule)
    if (regex) {
      const flags = regex[2] ?? ''
      if (/[^is]/.test(flags) || regex[1]!.length > 8192)
        return path + ': ' + rule + ' is not a usable guard'
      let pattern: RegExp
      try { pattern = new RegExp(regex[1], flags) }
      catch { return path + ': ' + rule + ' is not a usable guard' }
      const subject = typeof value === 'string' ? value
        : typeof value === 'number' || typeof value === 'boolean' ? String(value) : null
      if (subject === null || subject.length > 8192 || !pattern.test(subject))
        return path + ' = ' + printable + ' does not match ' + rule
      continue
    }
    if (['string', 'number', 'bool', 'boolean', 'object', 'array'].includes(rule)) {
      const kind = value === null || value === undefined ? 'missing'
        : Array.isArray(value) ? 'array' : typeof value === 'boolean' ? 'bool' : typeof value
      const sought = rule === 'boolean' ? 'bool' : rule
      if (kind !== sought) return path + ' = ' + printable + ' is not a ' + rule
      continue
    }
    const literal = typeof value === 'string' ? value === rule
      : typeof value === 'number' || typeof value === 'boolean' ? String(value) === rule : false
    if (!literal) return path + ' = ' + printable + ' is not "' + rule + '"'
  }
  return null
}
export function compareEvalMockExpected317(actual: unknown, expected: Expected): string | null {
  if (expected === null) return null
  if (typeof expected !== 'object' || Array.isArray(expected))
    return 'expect must be an object of named input guards'
  return compareExpectedRules317(actual, expected)
}

export async function interpolateEvalMock317(template: string, input: Record<string, unknown>,
  baseDir: string): Promise<{ ok: true; text: string } | { ok: false; reason: string }> {
  let error: string | undefined
  const segments: Array<string | Promise<string>> = []
  let offset = 0
  for (const m of template.matchAll(/\{\{\s*(input\.[A-Za-z0-9_.-]+|file:(?:[^{}]|\{input\.[A-Za-z0-9_.-]+\})+?)\s*\}\}/g)) {
    segments.push(template.slice(offset, m.index))
    offset = (m.index ?? 0) + m[0].length
    const expression = m[1]!
    if (expression.startsWith('input.')) {
      const value = nested(input, expression.slice(6))
      segments.push(shorten(value === undefined ? '' : typeof value === 'string' ? value : JSON.stringify(value)))
      continue
    }
    const fileName = expression.slice(5).trim().replace(/\{input\.([A-Za-z0-9_.-]+)\}/g,
      (_full, path: string) => {
        const value = nested(input, path)
        const word = value == null ? '' : String(value)
        if (!/^(?!\.{1,2}$)[A-Za-z0-9._-]+$/.test(word))
          error ??= 'file input is not a plain file-name segment'
        return word
      })
    const file = resolve(baseDir, fileName)
    const relativeFile = relative(baseDir, file)
    if (!relativeFile || relativeFile === '..' || relativeFile.startsWith('..' + '/') ||
      relativeFile.startsWith('..' + '\\') || isAbsolute(relativeFile)) {
      error ??= '{{file:' + fileName + '}} names a path outside the mock\'s directory'
      continue
    }
    segments.push(openRegular(file, MAX_FIXTURE_BYTES, 'mock fixture').catch(reason => {
      error ??= '{{file:' + fileName + '}}: ' + String(reason)
      return ''
    }))
  }
  segments.push(template.slice(offset))
  const pieces = await Promise.all(segments)
  return error ? { ok: false, reason: error } : { ok: true, text: pieces.join('') }
}

async function relayAgent317(agent: NonNullable<MockSpec317['agent']>, tool: string,
  name: string, input: Record<string, unknown>, signal: AbortSignal): Promise<Verdict> {
  const payload = JSON.stringify({ token: agent.token, registeredName: name, tool, input }) + '\n'
  return await new Promise<Verdict>((done, reject) => {
    if (signal.aborted) { reject(Error('aborted')); return }
    const socket = createConnection(agent.socketPath)
    let buffer = Buffer.alloc(0), settled = false
    const finish = (error: Error | null, result?: Verdict) => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', onAbort)
      socket.destroy()
      if (error) reject(error)
      else done(result!)
    }
    const onAbort = () => finish(Error('aborted'))
    signal.addEventListener('abort', onAbort, { once: true })
    socket.on('connect', () => socket.write(payload))
    socket.on('data', bytes => {
      buffer = Buffer.concat([buffer, bytes])
      if (buffer.length > MAX_RELAY_BYTES) { finish(Error('relay response too large')); return }
      const eol = buffer.indexOf(10)
      if (eol !== -1) {
        try {
          const result = JSON.parse(buffer.subarray(0, eol).toString('utf8')) as Verdict
          if (!['ok', 'tool_error', 'abort'].includes(result.verdict) || typeof result.text !== 'string')
            throw Error('invalid agent verdict')
          finish(null, result)
        } catch (error) { finish(error as Error) }
      }
    })
    socket.on('error', error => finish(error))
    socket.on('close', () => finish(Error('harness closed relay without answering')))
  })
}
export async function runEvalMockServer317(specPath: string | undefined,
  pinnedSha?: string): Promise<void> {
  if (!specPath) throw Error('missing spec path')
  // Original 317 accepts at most 4 MiB and refuses symlinks/nonregular files.
  const stat = await lstat(specPath)
  if (!stat.isFile() || stat.isSymbolicLink()) throw Error('spec path is not a regular file — refusing to read it')
  const bytes = await openRegular(specPath, MAX_SPEC_BYTES, 'spec')
  if (pinnedSha !== undefined &&
    createHash('sha256').update(bytes).digest('hex') !== pinnedSha)
    throw Error('spec file does not match the hash the harness launched this stand-in with — refusing to serve it')
  const spec = validateEvalMockSpec317(JSON.parse(bytes))
  if (!await recordLine(spec.callLogPath, { ready: spec.nonce, server: spec.server }))
    throw Error('could not write the identity line to the run call log — refusing to serve unidentified')
  let seq = 0
  const abort = new AbortController()
  const server = new Server({ name: 'eval-mock/' + spec.server, version: '1' },
    { capabilities: { tools: {} } })
  server.onclose = () => abort.abort()
  server.setRequestHandler('tools/list', async () => ({
    tools: spec.tools.map(tool => ({
      name: tool.name, description: tool.description,
      inputSchema: { type: 'object' as const, ...tool.inputSchema },
    })),
  }))
  // Calls are processed serially, ensuring deterministic seq and call logs.
  let queue = Promise.resolve()
  server.setRequestHandler('tools/call', req => {
    const work = queue.then(async () => {
      const name = req.params.name
      const input = (req.params.arguments ?? {}) as Record<string, unknown>
      const responder = Object.hasOwn(spec.responders, name) ? spec.responders[name] : undefined
      const started = Date.now()
      let verdict: Verdict
      if (!responder) verdict = { verdict: 'tool_error', text: 'no mock for ' + spec.server + '/' + name }
      else {
        const mismatch = compareEvalMockExpected317(input, responder.expect)
        if (mismatch) verdict = { verdict: 'abort', text: 'input violates expect: ' + mismatch }
        else if (responder.kind === 'fixed') {
          const interpolated = await interpolateEvalMock317(responder.body, input, responder.baseDir)
          if ('reason' in interpolated) {
            verdict = { verdict: 'tool_error', text: interpolated.reason }
          } else {
            verdict = { verdict: responder.isError ? 'tool_error' : 'ok', text: interpolated.text }
          }
        } else if (!spec.agent) verdict = {
          verdict: 'tool_error', text: 'agent mock responder called without a harness relay',
        }
        else {
          try { verdict = await relayAgent317(spec.agent, name, spec.registeredName, input, abort.signal) }
          catch (error) {
            process.stderr.write('eval mock stand-in: agent relay failed: ' + String(error) + '\n')
            verdict = { verdict: 'abort', text: RELAY_FAILURE + ' (harness_unreachable) — see the eval debug log' }
          }
        }
      }
      await recordLine(spec.callLogPath, {
        nonce: spec.nonce, seq: seq++, server: spec.server, tool: name,
        responder: responder?.kind ?? 'fixed',
        // Upstream writes the real JSON object unless its serialized size
        // exceeds 16 KiB; large arguments become a bounded string.
        input: JSON.stringify(input).length > MAX_OUTPUT_CHARS
          ? shorten(JSON.stringify(input)) : input,
        verdict: verdict.verdict, output: shorten(verdict.text),
        ms: Date.now() - started,
        ...(verdict.replay ? { replay: verdict.replay } : {}),
      })
      return {
        content: [{ type: 'text' as const,
          text: verdict.verdict === 'abort'
            ? ABORT_TEXT + ' ' + spec.nonce + ': ' + spec.server + '/' + name + ' — ' + verdict.text
            : protectEvalMockText317(verdict.text) }],
        ...(verdict.verdict !== 'ok' ? { isError: true } : {}),
      }
    })
    queue = work.then(() => {}, () => {})
    return work
  })
  await server.connect(new StdioServerTransport())
  process.stdin.on('end', () => { void server.close() })
  process.stdin.on('error', () => { void server.close() })
}
