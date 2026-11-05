#!/usr/bin/env node
/**
 * 官方 2.1.310 与当前重建版的 413 上下文恢复行为差分。
 * 隔离 HOME + 本机模拟 API，避免真实授权、付费请求和网络依赖。
 * 用法：
 * node build/m1-413-recovery-probe.mjs --reference /path/to/x64 --candidate /path/to/cli --report /tmp/result.json --allow-candidate-diff true
 */
import { createHash } from 'node:crypto'
import { createReadStream, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'

const argv = process.argv.slice(2)
if (argv.length % 2) throw Error('必须成对传入 --key value')
const args = Object.fromEntries(Array.from({ length: argv.length / 2 }, (_, i) => [argv[2 * i], argv[2 * i + 1]]))
if (!args['--reference'] || !args['--report']) throw Error('需要 --reference 和 --report')
const expectedSha = 'b73676430af12f97316a798b8371f81d640f90a58bdcb8f3ce56a835bb47df56'
const digest = createHash('sha256')
for await (const chunk of createReadStream(args['--reference'])) digest.update(chunk)
if (digest.digest('hex') !== expectedSha) throw Error('官方 x64 SHA-256 校验失败')

function successSse(model, answer) {
  const message = {
    id: 'msg_413_local', type: 'message', role: 'assistant', model, content: [],
    stop_reason: null, stop_sequence: null,
    usage: { input_tokens: 100000, output_tokens: 3, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  }
  const frames = [
    ['message_start', { type: 'message_start', message }],
    ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
    ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: answer } }],
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    ['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 3 } }],
    ['message_stop', { type: 'message_stop' }],
  ]
  return frames.map(([name, body]) => `event: ${name}\ndata: ${JSON.stringify(body)}\n\n`).join('')
}

function isolatedEnv(home, port) {
  const env = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (/ANTHROPIC|CLAUDE|TOKEN|SECRET|PASSWORD|API_KEY|AWS_|GOOGLE_|OPENAI_|GITHUB_/i.test(key)) continue
    env[key] = value
  }
  return {
    ...env, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: home, XDG_CACHE_HOME: home,
    ANTHROPIC_API_KEY: 'local-only-test-key', ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}`,
    DISABLE_TELEMETRY: '1', DISABLE_ERROR_REPORTING: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    NO_PROXY: '127.0.0.1,localhost', HTTP_PROXY: '', HTTPS_PROXY: '',
  }
}

async function execute(bin, home, env, moreArgs) {
  const command = spawn(resolve(bin), [
    '--bare', '--print', '--tools', '', '--max-turns', '4', '--output-format', 'json', ...moreArgs,
  ], { cwd: home, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = '', stderr = ''
  command.stdout.on('data', c => { stdout += c })
  command.stderr.on('data', c => { stderr += c })
  const guard = setTimeout(() => command.kill('SIGKILL'), 27000)
  let exitCode, signal
  try { [exitCode, signal] = await once(command, 'close') }
  finally { clearTimeout(guard) }
  let parsed
  try { parsed = JSON.parse(stdout) }
  catch { parsed = null }
  return {
    exitCode, signal, terminal_reason: parsed?.terminal_reason, api_error_status: parsed?.api_error_status,
    is_error: parsed?.is_error, result: parsed?.result, session_id: parsed?.session_id,
    stdout_preview: parsed ? undefined : stdout.slice(0, 400), stderr_preview: stderr.slice(0, 400),
  }
}

async function scenario(bin, kind) {
  const home = mkdtempSync(join(tmpdir(), 'm1-413-'))
  const calls = []
  const server = createServer(async (req, res) => {
    if (req.method === 'HEAD') { res.writeHead(200); res.end(); return }
    if (req.method !== 'POST' || !req.url?.startsWith('/v1/messages')) {
      res.writeHead(404); res.end(); return
    }
    let raw = ''
    for await (const chunk of req) raw += chunk
    const body = JSON.parse(raw)
    const index = calls.length
    const should413 = kind === 'single' ? index === 0 : index === 1
    calls.push({ http: should413 ? 413 : 200, messageCount: body.messages?.length ?? null, bytes: raw.length })
    if (should413) {
      res.writeHead(413, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ type: 'error', error: {
        type: 'invalid_request_error', message: 'prompt is too long: prompt exceeds the context window',
      } }))
      return
    }
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.end(successSse(body.model, index === 0 ? 'INIT_OK' : 'RECOVERED'))
  })
  try {
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const env = isolatedEnv(home, server.address().port)
    const first = await execute(bin, home, env, ['first user turn'])
    const second = kind === 'multi' ? await execute(bin, home, env, ['--continue', 'second user turn']) : null
    const pass = kind === 'single'
      ? calls.length === 1 && first.exitCode !== 0 && first.terminal_reason === 'prompt_too_long' && first.api_error_status === 413
      : first.exitCode === 0 && first.is_error === false && second?.exitCode === 0 && second?.is_error === false &&
        second?.result === 'RECOVERED' && first.session_id === second?.session_id && calls.length >= 4 &&
        calls[1]?.http === 413 && calls.slice(2).some(c => c.http === 200)
    return { kind, pass, calls, first, second }
  } finally {
    await new Promise(done => server.close(done))
    rmSync(home, { recursive: true, force: true })
  }
}

async function suite(bin) {
  return [await scenario(bin, 'single'), await scenario(bin, 'multi')]
}

const reference = await suite(args['--reference'])
const candidate = args['--candidate'] ? await suite(args['--candidate']) : null
const result = {
  schema: 1, target: '2.1.310', scenario: 'context-overflow-413',
  reference, candidate,
  reference_passed: reference.every(s => s.pass),
  candidate_passed: candidate?.every(s => s.pass) ?? null,
  candidate_matches_target: candidate ? candidate.every(s => s.pass) : null,
  limitations: ['隔离本机模拟 API', '无云端真实凭据与付费调用', '不能推断旧 contextCollapse 所有持久化行为已经等价'],
}
mkdirSync(dirname(resolve(args['--report'])), { recursive: true })
writeFileSync(resolve(args['--report']), `${JSON.stringify(result, null, 2)}\n`)
console.log(JSON.stringify({
  reference_passed: result.reference_passed, candidate_passed: result.candidate_passed,
  official_request_counts: reference.map(s => s.calls.length), candidate_request_counts: candidate?.map(s => s.calls.length) ?? null,
  candidate_cases: candidate?.map(s => ({kind:s.kind,pass:s.pass,calls:s.calls,first:s.first,second:s.second})) ?? null,
}))
if (!result.reference_passed || (candidate && !result.candidate_passed && args['--allow-candidate-diff'] !== 'true')) process.exitCode = 1
