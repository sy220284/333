import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve, sep } from 'node:path'
import { test } from 'node:test'

const root = resolve(import.meta.dirname, '..')
const model = 'claude-sonnet-4-6'
const sse = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`

function response(content, stopReason) {
  return [
    sse('message_start', { type: 'message_start', message: { id: 'msg_skill', type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 3, output_tokens: 0 } } }),
    ...content,
    sse('message_delta', { type: 'message_delta', delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 3 } }),
    sse('message_stop', { type: 'message_stop' }),
  ].join('')
}

test('api-version opens the bundled 2.1.310 migration guide through the actual Read tool', { timeout: 90000 }, async () => {
  const tmp = mkdtempSync(join(tmpdir(), '333-claude-api-'))
  const finishedCliProcessIds = []
  let requests = []
  let targetName = ''
  const extracted = new Map()
  function resourceHashes(base, dir = base) {
    return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const file = join(dir, entry.name)
      if (entry.isDirectory()) return resourceHashes(base, file)
      const path = relative(base, file).split(sep).join('/')
      return [[path, createHash('sha256').update(readFileSync(file)).digest('hex')]]
    })
  }
  const server = createServer(async (req, res) => {
    if (req.method === 'HEAD') { res.writeHead(200); res.end(); return }
    if (!req.url.startsWith('/v1/messages')) { res.writeHead(404); res.end(); return }
    let raw = ''
    for await (const part of req) raw += part
    const body = JSON.parse(raw)
    requests.push(body)
    let content, stop
    const blocks = body.messages.flatMap(m => Array.isArray(m.content) ? m.content : [])
    const text = blocks.filter(c => c.type === 'text').map(c => c.text).join('\n')
    if (text.includes('<command-name>/claude-api</command-name>') && !blocks.some(c => c.type === 'tool_result' && c.tool_use_id === 'toolu_skill_read')) {
      const base = /^Base directory for this skill: (.+)$/m.exec(text)?.[1]
      if (base && !extracted.has(targetName)) extracted.set(targetName, new Map(resourceHashes(base)))
      const file = base ? join(base, 'shared/api-version-migration.md') : join(tmp, 'missing-migration-guide')
      content = [
        sse('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_skill_read', name: 'Read', input: {} } }),
        sse('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify({ file_path: file }) } }),
        sse('content_block_stop', { type: 'content_block_stop', index: 0 }),
      ]
      stop = 'tool_use'
    } else {
      content = [
        sse('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
        sse('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'SKILL_READ_OK' } }),
        sse('content_block_stop', { type: 'content_block_stop', index: 0 }),
      ]
      stop = 'end_turn'
    }
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.end(response(content, stop))
  })
  try {
    await new Promise(ok => server.listen(0, '127.0.0.1', ok))
    const targets = [['333', 'bun', [join(root, 'dist/cli.js')]]]
    if (process.env.CLAUDE_2310_X64) targets.push(['2.1.310', process.env.CLAUDE_2310_X64, []])
    for (const [name, executable, prefix] of targets) {
      requests = []
      targetName = name
      const home = join(tmp, name)
      mkdirSync(home)
      const env = { PATH: process.env.PATH, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: home, XDG_CACHE_HOME: home, CI: '1', TERM: 'dumb', NO_COLOR: '1', ANTHROPIC_API_KEY: 'local-fixture', ANTHROPIC_BASE_URL: `http://127.0.0.1:${server.address().port}`, NO_PROXY: '127.0.0.1,localhost', DISABLE_TELEMETRY: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' }
      // The isolated HOME owns config and resource extraction; the process cwd must
      // outlive the test. On Windows a tool subprocess may still hold its cwd
      // when its CLI parent closes, which locks HOME and breaks deterministic cleanup.
      // Restrict to the isolated user setting source so the repository's
      // project settings never affect this skill-loading parity test.
      const child = spawn(executable, [...prefix, '-p', '/claude-api api-version', '--model', model, '--tools', 'Read', '--allowedTools', 'Read', '--setting-sources', 'user', '--output-format', 'json', '--max-turns', '2'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
      let stdout = '', stderr = ''
      child.stdout.on('data', x => stdout += x)
      child.stderr.on('data', x => stderr += x)
      const timer = setTimeout(() => child.kill('SIGKILL'), 30000)
      const exit = await new Promise((ok, fail) => { child.once('error', fail); child.once('close', ok) })
      clearTimeout(timer)
      if (process.platform === 'win32' && child.pid) finishedCliProcessIds.push(child.pid)
      assert.equal(exit, 0, `${name}: ${stderr.slice(-500)}`)
      assert.equal(JSON.parse(stdout).result, 'SKILL_READ_OK')
      const initial = requests.find(r => JSON.stringify(r.messages).includes('<command-name>/claude-api</command-name>'))
      assert.ok(initial, `${name}: expected a skill request`)
      const prompt = JSON.stringify(initial.messages)
      assert.ok(prompt.includes('api-version-migration.md'), `${name}: missing migration guide instruction`)
      assert.ok(prompt.includes('Base directory for this skill:'), `${name}: missing extracted skill directory`)
      const toolResult = requests.flatMap(r => r.messages).flatMap(m => Array.isArray(m.content) ? m.content : []).find(c => c.type === 'tool_result' && c.tool_use_id === 'toolu_skill_read')
      assert.ok(toolResult, `${name}: missing Read result`)
      assert.notEqual(toolResult.is_error, true, `${name}: migration guide could not be read`)
      assert.match(JSON.stringify(toolResult), /Migrating to a newer Claude API version/)
      assert.match(JSON.stringify(toolResult), /2026-10-21/)
    }
    const candidateFiles = extracted.get('333')
    assert.equal(candidateFiles?.size, 104, 'all available target resources should be extracted')
    if (process.env.CLAUDE_2310_X64) {
      const officialFiles = extracted.get('2.1.310')
      officialFiles.delete('shared/managed-agents-secure.md')
      assert.deepEqual(candidateFiles, officialFiles, 'extracted resource contents differ from 2.1.310')
    }
  } finally {
    server.closeAllConnections()
    await new Promise(ok => server.close(ok))
    // Windows can report EBUSY when a CLI child left a descendant process
    // with an inherited working directory. Identify any such process before
    // removing the fixture; do not swallow failures or disable the test.
    if (process.platform === 'win32' && finishedCliProcessIds.length) {
      const script = [
        '$ids = @(' + finishedCliProcessIds.join(',') + ')',
        'Get-CimInstance Win32_Process |',
        'Where-Object { $ids -contains $_.ParentProcessId } |',
        'Select-Object ProcessId, ParentProcessId, Name | ConvertTo-Json -Compress',
      ].join(' ')
      const active = spawnSync('powershell.exe', ['-NoProfile', '-Command', script], {
        encoding: 'utf8', timeout: 12000,
      })
      if (active.error || active.status !== 0) {
        process.stderr.write(`Windows descendant inspection failed: ${active.error?.message ?? active.stderr}\n`)
      } else if (active.stdout.trim()) {
        process.stderr.write(`Windows child descendants still active after CLI close: ${active.stdout.trim()}\n`)
      }
    }
    rmSync(tmp, { recursive: true, force: true, maxRetries: 25, retryDelay: 200 })
  }
})
