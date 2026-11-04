import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { connect } from 'node:net'
import { createServer } from 'node:http'
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { applyPreloadClaim317, validatePreloadClaim317, PRELOAD_RESET_KEYS_317 } from '../src/bootstrap/preload317.mjs'

const root = resolve(import.meta.dirname, '..')
const cli = join(root, 'dist/cli.js')

async function until(check, timeout = 12_000) {
  const deadline = Date.now() + timeout
  while (!check()) {
    if (Date.now() >= deadline) throw Error('Preload socket did not become ready')
    await new Promise(resolve => setTimeout(resolve, 50))
  }
}
function spawnPreload(bin, prefix, socket, extraEnv = {}) {
  const child = spawn(bin, [...prefix, '--preload', socket], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, DISABLE_TELEMETRY: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', ...extraEnv },
  })
  let stdout = '', stderr = ''
  child.stdout.on('data', c => { stdout += c })
  child.stderr.on('data', c => { stderr += c })
  const done = new Promise(resolve => {
    child.once('error', error => resolve({ error, stdout, stderr }))
    child.once('close', (code, signal) => resolve({ code, signal, stdout, stderr }))
  })
  return { child, done }
}
function sendClaim(socket, claim) {
  return new Promise((resolve, reject) => {
    const stream = connect(socket)
    stream.once('connect', () => { stream.end(JSON.stringify(claim) + '\n'); resolve() })
    stream.once('error', reject)
  })
}
test('M1 C19-T02 317 preload reset list matches verified original bytecode', () => {
  assert.equal(PRELOAD_RESET_KEYS_317.length, 116)
  assert.equal(new Set(PRELOAD_RESET_KEYS_317).size, 116)
  assert.equal(createHash('sha256')
    .update([...PRELOAD_RESET_KEYS_317].sort().join('\n'))
    .digest('hex'), '65213e19540550ca380ba8fc2be0f1a068e3bab142a8dbef3c551f44a35b6525')
  const env = Object.fromEntries(PRELOAD_RESET_KEYS_317.map(name => [name, 'STALE']))
  env.KEEP_THIS = 'ok'
  const home = mkdtempSync(join(tmpdir(), '333-preload-reset-'))
  try {
    applyPreloadClaim317({cwd:home,argv:['--version'],
      env:{CLAUDE_CODE_SESSION_ID:'fresh',KEEP_NEW:'yes'}}, {
      env,argv:['bun','cli','--preload'],chdir:()=>{},
    })
    assert.equal(env.CLAUDE_CODE_SESSION_ID, 'fresh')
    for (const name of PRELOAD_RESET_KEYS_317)
      if(name !== 'CLAUDE_CODE_SESSION_ID')
        assert.equal(env[name], undefined, 'stale env: ' + name)
    assert.equal(env.KEEP_THIS, 'ok')
    assert.equal(env.KEEP_NEW, 'yes')
  } finally {rmSync(home,{recursive:true,force:true})}
})

test('M1 C19-T02 preload claim validates every field before changing process state', () => {
  const home = mkdtempSync(join(tmpdir(), '333-preload-validate-'))
  try {
    assert.throws(() => validatePreloadClaim317({ cwd: home, argv: [1], env: {} }), /argv/)
    const mixed = validatePreloadClaim317({cwd:home,argv:[],env:{
      'INVALID-NAME':'accepted', '=INVALID':'drop', GOOD:'kept',
      BAD_NULL:'bad' + String.fromCharCode(0), BAD_NUMBER:3,
    }})
    assert.deepEqual(mixed.dropped.map(item => item.problem),
      ['invalid-name','nul-in-value','non-string-value'])
    assert.deepEqual(Object.fromEntries(mixed.env),
      {'INVALID-NAME':'accepted',GOOD:'kept'})
    
    const before = { CLAUDE_CODE_SESSION_ID: 'old', ANTHROPIC_API_KEY: 'old', KEEP: 'yes' }
    const argv = ['bun', 'cli', '--preload']
    let moved
    applyPreloadClaim317({ cwd: home, argv: ['--version'], env: { ANTHROPIC_API_KEY: 'new', FRESH: 'yes' } }, {
      env: before, argv, chdir: target => { moved = target },
    })
    assert.equal(moved, home)
    assert.deepEqual(argv, ['bun', 'cli', '--version'])
    assert.equal(before.CLAUDE_CODE_SESSION_ID, undefined)
    assert.equal(before.ANTHROPIC_API_KEY, 'new')
    assert.equal(before.KEEP, 'yes')
  } finally { rmSync(home, { recursive: true, force: true }) }
})
test('M1 C19-T02 official and rebuilt preload accept a claim, run --version, release socket and pid', {
  skip: process.platform === 'win32', timeout: 90_000,
}, async () => {
  const bins = [['rebuilt', 'bun', [cli]]]
  if (process.env.CLAUDE_TARGET_X64 || process.env.CLAUDE_REFERENCE_BIN) bins.unshift(['official', process.env.CLAUDE_TARGET_X64 || process.env.CLAUDE_REFERENCE_BIN, []])
  for (const [name, bin, prefix] of bins) {
    const home = mkdtempSync(join(tmpdir(), '333-preload-e2e-'))
    const sock = join(home, 'claim.sock')
    const started = spawnPreload(bin, prefix, sock)
    try {
      await until(() => existsSync(sock) || started.child.exitCode !== null)
      assert.equal(started.child.exitCode, null, name + ' startup failed')
      await until(() => existsSync(sock + '.pid'))
      assert.equal(readFileSync(sock + '.pid', 'utf8'), String(started.child.pid), name + ' pid')
      await sendClaim(sock, { cwd: home, argv: ['--version'], env: {
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', DISABLE_TELEMETRY: '1',
      } })
      const result = await Promise.race([started.done, new Promise((_, reject) => setTimeout(() => reject(Error(name + ' claim hung')), 20_000))])
      assert.equal(result.code, 0, name + ' ' + JSON.stringify(result))
      assert.equal(result.stdout.trim(), '2.1.317 (Claude Code)', name)
      assert.equal(existsSync(sock), false, name + ' socket')
      assert.equal(existsSync(sock + '.pid'), false, name + ' pid')
    } finally {
      started.child.kill('SIGTERM')
      rmSync(home, { recursive: true, force: true })
    }
  }
})
test('M1 C19-T02 preload TERM releases the claim socket and pid without a session', {
  skip: process.platform === 'win32', timeout: 30_000,
}, async () => {
  const home = mkdtempSync(join(tmpdir(), '333-preload-stop-'))
  const socket = join(home, 'claim.sock')
  const started = spawnPreload('bun', [cli], socket)
  try {
    await until(() => existsSync(socket) && existsSync(socket + '.pid'))
    started.child.kill('SIGTERM')
    const result = await Promise.race([started.done, new Promise((_, reject) => setTimeout(() => reject(Error('terminate hung')), 8_000))])
    assert.equal(result.code, 0, JSON.stringify(result))
    assert.equal(existsSync(socket), false)
    assert.equal(existsSync(socket + '.pid'), false)
  } finally { started.child.kill('SIGKILL'); rmSync(home, { recursive: true, force: true }) }
})

test('M1 C19-T02 preloaded process uses claimed API host and auth for a real SSE model response', {
  skip: process.platform === 'win32', timeout: 90_000,
}, async () => {
  const requests = []
  const event = (type, data) => 'event: ' + type + '\ndata: ' + JSON.stringify(data) + '\n\n'
  const server = createServer((req, res) => {
    if (req.method !== 'POST' || !req.url.startsWith('/v1/messages')) {
      res.writeHead(404).end()
      return
    }
    const chunks = []
    req.on('data', data => chunks.push(data))
    req.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString())
      requests.push({ model: body.model, key: req.headers['x-api-key'] })
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.end([
        event('message_start', { type:'message_start', message:{
          id:'msg_preload', type:'message', role:'assistant', model:body.model,
          content:[], stop_reason:null, stop_sequence:null,
          usage:{input_tokens:2,output_tokens:0},
        }}),
        event('content_block_start', {type:'content_block_start',index:0,content_block:{type:'text',text:''}}),
        event('content_block_delta', {type:'content_block_delta',index:0,delta:{type:'text_delta',text:'PRELOAD_CLAIM_OK'}}),
        event('content_block_stop', {type:'content_block_stop',index:0}),
        event('message_delta', {type:'message_delta',delta:{stop_reason:'end_turn',stop_sequence:null},usage:{output_tokens:2}}),
        event('message_stop', {type:'message_stop'}),
      ].join(''))
    })
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const binaries = [['rebuilt', 'bun', [cli]]]
  if (process.env.CLAUDE_TARGET_X64 || process.env.CLAUDE_REFERENCE_BIN) binaries.unshift(['official', process.env.CLAUDE_TARGET_X64 || process.env.CLAUDE_REFERENCE_BIN, []])
  try {
    for (const [name, executable, prefix] of binaries) {
      const home = mkdtempSync(join(tmpdir(), '333-preload-model-'))
      const sock = join(home, 'claim.sock')
      const started = spawnPreload(executable, prefix, sock, {
        ANTHROPIC_BASE_URL: 'http://127.0.0.1:1',
        ANTHROPIC_API_KEY: 'old-credential',
      })
      try {
        await until(() => existsSync(sock))
        await sendClaim(sock, { cwd:home,
          argv:['--bare','-p','hello','--output-format=json','--model','claude-sonnet-4-6'],
          env: {
            ANTHROPIC_BASE_URL:'http://127.0.0.1:' + server.address().port,
            ANTHROPIC_API_KEY:'fresh-credential',
            CLAUDE_CONFIG_DIR:home, HOME:home,
            DISABLE_TELEMETRY:'1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1',
          },
        })
        const result = await Promise.race([started.done,
          new Promise((_, reject) => setTimeout(() => reject(Error(name + ' model timeout')), 28_000))])
        assert.equal(result.code, 0, name + ' ' + JSON.stringify(result))
        assert.equal(JSON.parse(result.stdout.trim()).result, 'PRELOAD_CLAIM_OK', name)
        assert.equal(requests.at(-1).key, 'fresh-credential', name + ' retained old auth')
        assert.equal(requests.at(-1).model, 'claude-sonnet-4-6')
        assert.equal(existsSync(sock), false)
        assert.equal(existsSync(sock + '.pid'), false)
      } finally {
        started.child.kill('SIGKILL')
        rmSync(home, {recursive:true,force:true})
      }
    }
    assert.equal(requests.length, binaries.length)
  } finally {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
})
