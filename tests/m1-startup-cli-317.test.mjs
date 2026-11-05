import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const cli = resolve(import.meta.dirname, '../dist/cli.js')
const standalone = resolve(import.meta.dirname, '../dist', process.platform === 'win32' ? 'claude.exe' : 'claude')
const nativeRuntimeMode = process.env.M1_NATIVE_BINARY_RUN === '1'
const id = '11111111-1111-4111-8111-111111111111'
const model = 'claude-sonnet-4-6'
function launch(args, env) {
  return new Promise((done, fail) => {
    const child = spawn(nativeRuntimeMode ? standalone : 'bun', nativeRuntimeMode ? args : [cli, ...args], { env, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = '', stderr = ''
    const timeout = setTimeout(() => child.kill('SIGKILL'), 25_000)
    child.stdout.on('data', data => { stdout += data }); child.stderr.on('data', data => { stderr += data })
    child.on('error', error => { clearTimeout(timeout); fail(error) })
    child.on('close', (status, signal) => { clearTimeout(timeout); done({ status, signal, stdout, stderr }) })
  })
}
test('deep-link argument injection is rejected before configuration side effects', () => {
  const home = mkdtempSync(join(tmpdir(), '333-deep-link-'))
  try {
    const result = spawnSync('bun', [cli, '--handle-uri', 'claude://open', '--settings', 'malicious'], { encoding: 'utf8', timeout: 5000, env: { ...process.env, CLAUDE_CONFIG_DIR: home } })
    assert.ifError(result.error); assert.equal(result.status, 1); assert.match(result.stderr, /argument injection/)
    assert.equal(existsSync(join(home, '.claude.json')), false)
  } finally { rmSync(home, { recursive: true, force: true }) }
})

test('deleted cwd produces the 317 structured startup failure without loading the REPL', { skip: process.platform === 'win32' }, () => {
  const script = `import os,sys,tempfile,json,subprocess,pathlib
with tempfile.TemporaryDirectory(prefix='333-cwd-') as home:
 gone=pathlib.Path(home)/'gone';gone.mkdir()
 child='import os,sys;os.chdir(sys.argv[1]);os.rmdir(sys.argv[1]);os.execvpe(sys.argv[2],sys.argv[2:],os.environ)'
 result=subprocess.run(['python3','-c',child,str(gone),'bun',sys.argv[1],'-p','prompt','--output-format=stream-json','--session-id',sys.argv[2]],env={**os.environ,'CLAUDE_CONFIG_DIR':home,'CLAUDE_CODE_STARTUP_FAILURE_RESULTS':'1'},text=True,capture_output=True,timeout=10)
 print(json.dumps({'status':result.returncode,'stdout':result.stdout,'stderr':result.stderr}))`
  const child = spawnSync('python3', ['-c', script, cli, id], { encoding: 'utf8', timeout: 15_000 })
  assert.ifError(child.error); assert.equal(child.status, 0, child.stderr)
  const result = JSON.parse(child.stdout), frame = JSON.parse(result.stdout)
  assert.equal(result.status, 1); assert.match(result.stderr, /current directory no longer exists/)
  assert.equal(frame.session_id, id); assert.equal(frame.startup_failure_reason, 'cwd_unavailable')
  assert.equal(frame.result_index, 0); assert.equal(frame.is_error, true)
})

test('real model requests preserve --desktop prompt text and the final settings model', async () => {
  const home = mkdtempSync(join(tmpdir(), '333-argv-model-'))
  const requests = []
  const sse = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  const server = createServer((request, response) => {
    if (request.method === 'HEAD') { response.end(); return }
    if (request.method !== 'POST' || !request.url.startsWith('/v1/messages')) { response.writeHead(404); response.end(); return }
    const chunks = []; request.on('data', chunk => chunks.push(chunk))
    request.on('end', () => {
      const message = JSON.parse(Buffer.concat(chunks).toString()); requests.push(message)
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      response.end([
        sse('message_start', { type: 'message_start', message: { id: 'msg_startup', type: 'message', role: 'assistant', model: message.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 2, output_tokens: 0 } } }),
        sse('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
        sse('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'STARTUP_OK' } }),
        sse('content_block_stop', { type: 'content_block_stop', index: 0 }),
        sse('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 2 } }),
        sse('message_stop', { type: 'message_stop' }),
      ].join(''))
    })
  })
  await new Promise(done => server.listen(0, '127.0.0.1', done))
  const env = { ...process.env, CLAUDE_CONFIG_DIR: home, ANTHROPIC_BASE_URL: `http://127.0.0.1:${server.address().port}`, ANTHROPIC_API_KEY: 'test-startup-key', DISABLE_TELEMETRY: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', CI: 'true', NO_COLOR: '1' }
  delete env.ANTHROPIC_MODEL
  try {
    const prompt = await launch(['--bare', '-p', '--model', model, '--output-format=json', '--', '--desktop'], env)
    assert.equal(prompt.status, 0, JSON.stringify(prompt)); assert.equal(JSON.parse(prompt.stdout).result, 'STARTUP_OK')
    assert.match(JSON.stringify(requests.at(-1).messages), /--desktop/)
    // Desktop/background/bare-looking option values must remain data, and the
    // model loop must execute instead of entering an unrelated startup route.
    for (const value of ['--desktop', '--bg', '--bare']) {
      const reserved = await launch(['-p', 'hello', '--system-prompt', value, '--model', model, '--output-format=json'], env)
      assert.equal(reserved.status, 0, `${value}: ${JSON.stringify(reserved)}`)
      assert.equal(JSON.parse(reserved.stdout).result, 'STARTUP_OK')
    }
    const settings = await launch(['--bare', '-p', 'hello', '--settings={"model":"wrong-first-model"}', `--settings={"model":"${model}"}`, '--output-format=json'], env)
    assert.equal(settings.status, 0, JSON.stringify(settings)); assert.equal(JSON.parse(settings.stdout).result, 'STARTUP_OK')
    assert.equal(requests.at(-1).model, model)
  } finally {
    server.closeAllConnections(); await new Promise(done => server.close(done)); rmSync(home, { recursive: true, force: true, maxRetries: 3 })
  }
})

test('official desktop/background conflict fails before loading Desktop or interactive CLI', () => {
  const cases = [
    { args: ['--desktop', '--bg'], message: "--desktop opens the Claude Desktop app and can't run in the background" },
    { args: ['--desktop', '--background'], message: "--desktop opens the Claude Desktop app and can't run in the background" },
    { args: ['--desktop', 'logs', 'deadbeef'], message: "--desktop can't be combined with \`claude logs\`." },
    { args: ['--settings={}', '--desktop', 'stop', 'deadbeef'], message: "--desktop can't be combined with \`claude stop\`." },
  ]
  const targets = [['rebuilt', process.execPath, [cli]]]
  if (process.env.CLAUDE_TARGET_X64) targets.push(['official', process.env.CLAUDE_TARGET_X64, []])
  for (const [label, bin, prefix] of targets) {
    // Under the rebuild test suite process.execPath points to Node; use Bun for the bundled CLI.
    const executable = label === 'rebuilt' ? 'bun' : bin
    for (const { args, message } of cases) {
      const result = spawnSync(executable, [...prefix, ...args], {
        cwd: resolve(import.meta.dirname, '..'), encoding: 'utf8', timeout: 12_000,
        env: { ...process.env, DISABLE_TELEMETRY: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' },
      })
      assert.ifError(result.error)
      assert.equal(result.status, 1, label + ' ' + JSON.stringify(result))
      assert.ok(result.stderr.includes(message), label + ' ' + result.stderr)
    }
  }
})
