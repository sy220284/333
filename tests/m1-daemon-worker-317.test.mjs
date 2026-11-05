import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkDaemonStartupProxy317 } from '../src/bootstrap/daemonProxy317.ts'
import { validateHeartbeatConfig317, runDaemonWorker317, watchDaemonWorkerParent317,
  isDaemonWorkerAdmitted317, classifyDaemonWorkerFailure317 }
  from '../src/bootstrap/daemonWorker317.mjs'

const cli = resolve(import.meta.dirname, '../dist/cli.js')
const original = process.env.CLAUDE_REFERENCE_BIN || process.env.CLAUDE_TARGET_X64
const bins = [['rebuilt', 'bun', [cli]]]
if (original) bins.unshift(['official', original, []])

function launch(binary, args, data, stopOnHeartbeat = false, extraEnv = {}) {
  return new Promise((done, fail) => {
    // Remove inherited proxy keys before creating a deterministic test
    // environment: Windows folds case variants into the same process key.
    const env = { ...process.env }
    for (const key of Object.keys(env))
      if (/^(?:https?|all)_proxy$/i.test(key)) delete env[key]
    Object.assign(env, extraEnv, {
      DISABLE_TELEMETRY: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    })
    const child = spawn(binary, args, { stdio: ['pipe', 'pipe', 'pipe'], env })
    let stdout = '', stderr = '', finished = false, stopSent = false
    // The worker can take several seconds to cold-start on macOS Intel.
    // Signal only after the protocol has emitted a real heartbeat.
    child.stdout.on('data', c => {
      stdout += c
      if (stopOnHeartbeat && !stopSent && stdout.split(/\r?\n/).includes('heartbeat')) {
        stopSent = true
        child.kill('SIGTERM')
      }
    })
    child.stderr.on('data', c => { stderr += c })
    const limit = setTimeout(() => {
      if (!finished) { finished = true; child.kill('SIGKILL'); fail(Error('daemon hung: ' + args.join(' '))) }
    }, 30_000)
    child.once('error', e => { if (!finished) { finished = true; clearTimeout(limit); fail(e) } })
    child.once('close', (code, signal) => {
      if (!finished) { finished = true; clearTimeout(limit); done({ code, signal, stdout, stderr }) }
    })
    child.stdin.end(data)
  })
}

test('317 strict heartbeat config: positive numbers, no unknown keys', () => {
  assert.deepEqual(validateHeartbeatConfig317({}), { ok: true, intervalSeconds: 30 })
  assert.deepEqual(validateHeartbeatConfig317({ intervalSeconds: 0.1 }), { ok: true, intervalSeconds: 0.1 })
  for (const invalid of [null, undefined, [], 3, 'x', { intervalSeconds: 0 },
    { intervalSeconds: -1 }, { intervalSeconds: '1' }, { other: true }])
    assert.equal(validateHeartbeatConfig317(invalid).ok, false, JSON.stringify(invalid))
})

test('317 official and rebuilt refuse unsupported worker kinds before input', async () => {
  for (const [kind, code, message] of [
    ['invalid', 2, 'unknown worker kind: invalid'],
    ['scheduled', 78, "worker kind 'scheduled' is not available."],
    ['remoteControl', 78, "worker kind 'remoteControl' is not available."],
  ]) {
    for (const [name, binary, prefix] of bins) {
      const res = await launch(binary, [...prefix, '--daemon-worker', kind], '{}')
      assert.equal(res.code, code, name + JSON.stringify(res))
      assert.equal(res.stderr.trim(), message, name)
      assert.equal(res.stdout, '', name)
    }
  }
})

test('317 official and rebuilt validate daemon stdin and exit status', async () => {
  const cases = [
    ['garbage', 2, /invalid config JSON on stdin:/],
    ['{}', 2, /config validation failed:/],
    ['{"config":{"intervalSeconds":0}}', 2, /Too small: expected number to be >0/],
    ['{"config":{"intervalSeconds":1,"other":1}}', 2, /"code": "unrecognized_keys"/],
  ]
  for (const [data, code, expected] of cases) {
    for (const [name, binary, prefix] of bins) {
      const res = await launch(binary, [...prefix, '--daemon-worker', 'heartbeat'], data)
      assert.equal(res.code, code, name + JSON.stringify(res))
      assert.match(res.stderr, expected, name + data)
    }
  }
})

test('317 daemon heartbeat emits periodic events and stops on SIGTERM', { timeout: 75000 }, async () => {
  let officialExit
  for (const [name, binary, prefix] of bins) {
    const res = await launch(binary, [...prefix, '--daemon-worker', 'heartbeat'],
      '{"config":{"intervalSeconds":0.1}}', true)
    if (name === 'official') officialExit = { code: res.code, signal: res.signal }
    if (officialExit && name !== 'official')
      assert.deepEqual({ code: res.code, signal: res.signal }, officialExit,
        name + ' differs from official termination: ' + JSON.stringify(res))
    else if (process.platform === 'win32')
      assert.equal(res.signal, 'SIGTERM', name + JSON.stringify(res))
    else assert.equal(res.code, 0, name + JSON.stringify(res))
    const lines = res.stdout.trim().split('\n')
    assert.equal(lines[0], 'heartbeat worker started (interval=0.1s)', name)
    assert.ok(lines.slice(1).includes('heartbeat'), name + JSON.stringify(res))
  }
})

test('317 IPC shutdown and parent watchdog release resources', { timeout: 6000 }, async () => {
  const controller = new AbortController()
  let gone = 0
  const cleanup = watchDaemonWorkerParent317(controller, {
    parentPid: () => 99, isAlive: () => false, onGone: () => { gone++ },
    intervalMs: 8, exitGraceMs: 10, log: () => {},
  })
  await new Promise(done => setTimeout(done, 45))
  assert.equal(controller.signal.aborted, true)
  assert.equal(gone, 1)
  cleanup()
  const parent = new EventEmitter()
  let output = '', error = ''
  const outcome = runDaemonWorker317('heartbeat', {
    parent,
    input: (async function* () { yield Buffer.from('{"config":{"intervalSeconds":10}}') })(),
    stdout: s => { output += s }, stderr: s => { error += s },
    parentWatcher: () => () => {},
  })
  await new Promise(done => setTimeout(done, 25))
  parent.emit('message', { type: 'shutdown' })
  assert.equal(await outcome, 0)
  assert.match(output, /heartbeat worker started/)
  assert.equal(error, '')
  assert.equal(parent.listenerCount('SIGTERM'), 0)
  assert.equal(parent.listenerCount('message'), 0)
})

test('317 daemon proxy is selected by original case-sensitive priority', () => {
  assert.equal(checkDaemonStartupProxy317({}), null)
  assert.equal(checkDaemonStartupProxy317({
    https_proxy: 'http://127.0.0.1:8888', HTTP_PROXY: 'bad proxy',
  }), null)
  assert.match(checkDaemonStartupProxy317({ HTTPS_PROXY: 'data:proxy' }),
    /Invalid proxy URL in HTTPS_PROXY/)
  assert.match(checkDaemonStartupProxy317({ HTTP_PROXY: 'bad\x01 proxy' }),
    /"bad proxy" cannot be parsed/)
})

test('317 daemon refuses invalid proxy before parsing worker kind or stdin', {
  timeout: 75_000,
}, async () => {
  const dir = mkdtempSync(join(tmpdir(), '333-daemon-proxy-'))
  const env = {
    CLAUDE_CONFIG_DIR: dir,
    http_proxy: 'bad url',
    CLAUDE_CODE_HOST_CREDS_FILE: undefined,
  }
  try {
    for (const [name, binary, prefix] of bins) {
      const result = await launch(binary, [...prefix, '--daemon-worker', 'invalid'],
        '{}', false, env)
      assert.equal(result.code, 78, name + JSON.stringify(result))
      assert.equal(result.stdout, '', name)
      assert.equal(result.stderr.trim(), [
        'Invalid proxy URL in http_proxy: "bad url" cannot be parsed as a URL.',
        'Proxy settings must be a complete URL including the scheme, e.g. "http://proxy.example.com:8080".',
        'Fix or unset http_proxy and restart Claude Code.',
        'Error: the proxy setting named above is refused.',
        'Start the daemon again once this is mended.',
      ].join('\n'), name)
    }
  } finally {
    rmSync(dir, {recursive: true, force: true})
  }
})

test('317 remoteControl admission matches official fleet gate, while scheduled stays closed', () => {
  assert.equal(isDaemonWorkerAdmitted317('heartbeat', false), true)
  assert.equal(isDaemonWorkerAdmitted317('scheduled', true), false)
  assert.equal(isDaemonWorkerAdmitted317('remoteControl', false), false)
  assert.equal(isDaemonWorkerAdmitted317('remoteControl', true), true)
})

test('317 admitted remoteControl validates strict config and routes the headless bridge', async () => {
  const parent = new EventEmitter()
  let channelUnref = 0
  parent.send = (_message, _handle, _options, callback) => callback?.(null)
  parent.channel = { unref: () => { channelUnref++ } }
  let output = '', error = '', launched = false
  const run = runDaemonWorker317('remoteControl', {
    parent,
    input:(async function*() {
      yield Buffer.from(JSON.stringify({initialAccessToken:'initial-token',
        config:{dir:'/tmp',spawnMode:'worktree',capacity:2,permissionMode:'manual',
          createSessionOnStart:false}}))
    })(),
    stdout: s=>{output+=s},stderr:s=>{error+=s},
    remoteControlGate:()=>true,parentWatcher:()=>()=>{},
    remoteControlRunner:async(config, signal, log, token)=>{
      launched=true
      assert.equal(config.permissionMode,'default')
      assert.equal(config.capacity,2)
      assert.equal(config.spawnMode,'worktree')
      assert.equal(token(),'initial-token')
      parent.emit('message',{type:'token_update',accessToken:'renewed-token'})
      assert.equal(token(),'renewed-token')
      log('remote worker started')
      parent.emit('message',{type:'shutdown'})
      assert.equal(signal.aborted,true)
    },
  })
  assert.equal(await run,0)
  assert.equal(launched,true)
  assert.equal(channelUnref, 1, 'IPC channel was left referenced')
  assert.match(output,/remote worker started/)
  assert.equal(error,'')
  assert.equal(parent.listenerCount('message'),0)
})

test('317 remoteControl gate rejects before reading stdin; malformed config is rejected when admitted',async()=>{
  const blocked = await runDaemonWorker317('remoteControl',{remoteControlGate:()=>false,
    input:(async function*(){throw Error('must not read input')})(),
    stdout:()=>{},stderr:()=>{}})
  assert.equal(blocked,78)
  let error = ''
  const invalid=await runDaemonWorker317('remoteControl',{remoteControlGate:()=>true,
    input:(async function*(){yield '{"config":{"dir":"/tmp","unknown":true}}'})(),
    stdout:()=>{},stderr:s=>{error+=s}})
  assert.equal(invalid,2)
  assert.match(error,/unrecognized_keys/)
})

test('317 daemon returns EX_TEMPFAIL on nested 429 and occupied-folder errors', async () => {
  const parent = new EventEmitter()
  async function runWithFailure(cause) {
    let stdout = '', stderr = ''
    const outcome = await runDaemonWorker317('remoteControl', {
      parent,
      input: (async function* () {
        yield JSON.stringify({ initialAccessToken: 'test-token', config: { dir: '/tmp' } })
      })(),
      stdout: s => { stdout += s }, stderr: s => { stderr += s },
      remoteControlGate: () => true,
      parentWatcher: () => () => {},
      remoteControlRunner: async () => { throw cause },
    })
    assert.equal(parent.listenerCount('message'), 0, 'IPC listener leaked after failure')
    return { outcome, stdout, stderr }
  }

  const limited = new Error('rate API failed', {
    cause: { response: { status: 429 }, cause: { errorType: 'bridge_folder_already_served' } },
  })
  assert.equal(classifyDaemonWorkerFailure317(limited), 'rate_limited')
  assert.deepEqual(await runWithFailure(limited), {
    outcome: 75, stdout: 'rate limited (429): rate API failed\n', stderr: '',
  })

  const occupied = new Error('another session owns folder', {
    cause: { cause: { errorType: 'bridge_folder_already_served' } },
  })
  assert.equal(classifyDaemonWorkerFailure317(occupied), 'folder_already_served')
  assert.deepEqual(await runWithFailure(occupied), {
    outcome: 75, stdout: 'folder already served: another session owns folder\n', stderr: '',
  })

  // Upstream xe() stops on the first numeric HTTP status. A nested 429
  // cannot override an outer 503; an independent folder-ownership failure
  // is still tested after the HTTP scan.
  assert.equal(classifyDaemonWorkerFailure317({
    status: 503, cause: {status: 429},
  }), undefined)
  assert.equal(classifyDaemonWorkerFailure317({
    response: {status: 503},
    cause: {status: 429, errorType: 'bridge_folder_already_served'},
  }), 'folder_already_served')
  assert.equal(classifyDaemonWorkerFailure317({
    status: '429', cause: {response: {status: 429}},
  }), 'rate_limited')

  const chain = (depth, leaf) => {
    let error = leaf
    for (let i = 0; i < depth; i++) error = { cause: error }
    return error
  }
  assert.equal(classifyDaemonWorkerFailure317(chain(7, { status: 429 })), 'rate_limited')
  assert.equal(classifyDaemonWorkerFailure317(chain(8, { status: 429 })), undefined)

  const permanent = new Error('permanent bridge refusal')
  permanent.name = 'BridgeHeadlessPermanentError'
  assert.deepEqual(await runWithFailure(permanent), {
    outcome: 78, stdout: 'permanent bridge refusal\n', stderr: '',
  })
  const unexpected = new Error('unknown failure')
  await assert.rejects(runWithFailure(unexpected), /unknown failure/)
  assert.equal(parent.listenerCount('message'), 0)
})

test('317 remoteControl sandbox refusal includes upstream remediation and exit 78', async () => {
  const parent = new EventEmitter()
  let stdout = '', stderr = ''
  const result = await runDaemonWorker317('remoteControl', {
    parent,
    input: (async function* () {
      yield JSON.stringify({ config: { dir: '/tmp', sandbox: true } })
    })(),
    stdout: s => { stdout += s }, stderr: s => { stderr += s },
    remoteControlGate: () => true,
  })
  assert.equal(result, 78)
  assert.equal(stdout,
    'The sandbox key is not supported for Remote Control. Remove it. ' +
    'To sandbox sessions, set sandbox.enabled to true in settings.\n')
  assert.equal(stderr, '')
  assert.equal(parent.listenerCount('message'), 0)
})
