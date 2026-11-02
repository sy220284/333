import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'

const args = process.argv.slice(2)
if (args.length % 2) throw Error('Expected --key value pairs')
const options = Object.fromEntries(Array.from({ length: args.length / 2 }, (_, i) => [args[2 * i], args[2 * i + 1]]))
if (!options['--reference'] || !options['--report']) throw Error('Missing --reference / --report')

const modes = [
  { name: 'explicit', env: { CLAUDE_CODE_EXTRA_BODY: JSON.stringify({ thinking: { type: 'adaptive', display: 'summarized' } }) }, display: 'summarized' },
  { name: 'disabled', env: { CLAUDE_CODE_DISABLE_THINKING: '1' }, display: null },
]

function frames(model) {
  const events = [
    ['message_start', { type: 'message_start', message: { id: 'msg_333_thinking_probe', type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } }],
    ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } }],
    ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'planning' } }],
    ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'sig' } }],
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    ['content_block_start', { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } }],
    ['content_block_delta', { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'done' } }],
    ['content_block_stop', { type: 'content_block_stop', index: 1 }],
    ['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 3 } }],
    ['message_stop', { type: 'message_stop' }],
  ]
  return events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join('')
}

async function probe(executable, mode) {
  const home = mkdtempSync(resolve(tmpdir(), '333-sdk-thinking-'))
  let requests = 0
  let requestThinking
  const server = createServer(async (req, res) => {
    if (req.method === 'HEAD') { res.writeHead(200); res.end(); return }
    if (req.method !== 'POST' || !req.url?.startsWith('/v1/messages')) { res.writeHead(404); res.end(); return }
    let raw = ''
    for await (const part of req) raw += part
    const body = JSON.parse(raw)
    requests++
    requestThinking = body.thinking
    const answer = frames(body.model)
    res.writeHead(200, { 'content-type': 'text/event-stream', 'content-length': String(Buffer.byteLength(answer)) })
    res.end(answer)
  })
  try {
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const env = {}
    for (const [key, value] of Object.entries(process.env)) {
      if (!/CLAUDE|ANTHROPIC|TOKEN|SECRET|PASSWORD|API_KEY|AWS_|GOOGLE_|OPENAI_|GITHUB_/i.test(key)) env[key] = value
    }
    Object.assign(env, {
      HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: home, XDG_CACHE_HOME: home,
      ANTHROPIC_API_KEY: 'local-only-test-key', ANTHROPIC_BASE_URL: `http://127.0.0.1:${server.address().port}`,
      DISABLE_TELEMETRY: '1', DISABLE_ERROR_REPORTING: '1',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', NO_PROXY: '127.0.0.1,localhost',
    }, mode.env)
    const child = spawn(resolve(executable), ['--print', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--no-session-persistence', 'hello'], { cwd: home, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = '', stderr = ''
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    const timer = setTimeout(() => child.kill('SIGKILL'), 25000)
    let code, signal
    try { [code, signal] = await once(child, 'close') } finally { clearTimeout(timer) }
    const messages = stdout.trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
    const events = messages.filter(message => message.type === 'stream_event')
    const types = events.map(message => `${message.event.type}:${message.event.delta?.type ?? message.event.content_block?.type ?? ''}`)
    const displays = events.map(message => message.thinking_display ?? null)
    const expectedTypes = ['message_start:', 'content_block_start:thinking', 'content_block_delta:thinking_delta', 'content_block_delta:signature_delta', 'content_block_stop:', 'content_block_start:text', 'content_block_delta:text_delta', 'content_block_stop:', 'message_delta:', 'message_stop:']
    const expectedDisplays = [mode.display, mode.display, mode.display, null, null, null, null, null, null, null]
    const sentExpected = mode.name === 'explicit'
      ? requestThinking?.type === 'adaptive' && requestThinking?.display === 'summarized'
      : requestThinking === undefined
    const result = messages.findLast(message => message.type === 'result')
    const passed = code === 0 && requests > 0 && sentExpected &&
      JSON.stringify(types) === JSON.stringify(expectedTypes) && JSON.stringify(displays) === JSON.stringify(expectedDisplays) &&
      result?.result === 'done' && result?.is_error === false
    return { mode: mode.name, passed, code, signal, requests, requestThinking: requestThinking ?? null, types, displays, stderr: stderr.slice(-300) }
  } finally {
    await new Promise(done => server.close(done))
    rmSync(home, { recursive: true, force: true })
  }
}

async function run(executable) {
  const results = []
  for (const mode of modes) results.push(await probe(executable, mode))
  return results
}
const reference = await run(options['--reference'])
const candidate = options['--candidate'] ? await run(options['--candidate']) : null
const report = { reference, candidate, scope: 'explicit request display and thinking-disabled metadata with a local SSE endpoint' }
mkdirSync(dirname(resolve(options['--report'])), { recursive: true })
writeFileSync(resolve(options['--report']), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report))
if (!reference.every(item => item.passed) || candidate && !candidate.every(item => item.passed)) process.exitCode = 1
