import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

const reference = process.env.CLAUDE_CODE_317_REFERENCE
const event = (type: string, value: unknown) => `event: ${type}\ndata: ${JSON.stringify(value)}\n\n`

test('317 file boundaries govern actual Read and file creation, exemptions, project settings and symlinks', { timeout: 180000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), '333-m2-fence-'))
  const cwd = join(dir, 'project'), outside = join(dir, 'private'), file = join(outside, 'secret.txt')
  mkdirSync(join(cwd, '.claude'), { recursive: true }); mkdirSync(outside)
  writeFileSync(file, 'PRIVATE_317_BYTES')
  writeFileSync(join(cwd, 'inside.txt'), 'INSIDE_317_BYTES')
  if (process.platform !== 'win32') symlinkSync(file, join(cwd, 'link.txt'))
  type Case = { name: string; tool: 'Read' | 'Edit'; path: string; allowed: boolean; flags?: object; project?: object }
  const cases: Case[] = [
    { name: 'inside read', tool: 'Read', path: join(cwd, 'inside.txt'), allowed: true },
    { name: 'outside read', tool: 'Read', path: file, allowed: false },
    { name: 'flag exemption', tool: 'Read', path: file, allowed: true, flags: { blockReadsExemptPaths: [outside] } },
    { name: 'project exemption', tool: 'Read', path: file, allowed: false, project: { blockReadsExemptPaths: [outside] } },
    { name: 'project directory', tool: 'Read', path: file, allowed: false, project: { additionalDirectories: [outside] } },
    { name: 'inside write', tool: 'Edit', path: join(cwd, 'created.txt'), allowed: true },
    { name: 'outside write', tool: 'Edit', path: join(outside, 'created.txt'), allowed: false },
    ...(process.platform === 'win32' ? [] : [{ name: 'outside symlink', tool: 'Read' as const, path: join(cwd, 'link.txt'), allowed: false }]),
  ]
  let active = cases[0]!, calls = 0, toolResult: { is_error?: boolean; content?: unknown } | undefined
  const server = createServer((req, res) => {
    if (req.method === 'HEAD') { res.end(); return }
    if (req.method !== 'POST' || !req.url?.startsWith('/v1/messages')) { res.writeHead(404).end(); return }
    let input = ''; req.on('data', chunk => { input += chunk })
    req.on('end', () => {
      const body = JSON.parse(input)
      calls++
      const first = calls === 1
      if (!first) toolResult = body.messages.flatMap((m: { content?: unknown }) => Array.isArray(m.content) ? m.content : []).find((b: { type?: string; tool_use_id?: string }) => b.type === 'tool_result' && b.tool_use_id === 'tool_fence')
      const block = first ? { type: 'tool_use', id: 'tool_fence', name: active.tool, input: {} } : { type: 'text', text: '' }
      const delta = first ? { type: 'input_json_delta', partial_json: JSON.stringify({ file_path: active.path, ...(active.tool === 'Edit' && { old_string: '', new_string: 'CREATED_317_BYTES' }) }) } : { type: 'text_delta', text: 'FENCE_OK' }
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.end(event('message_start', { type: 'message_start', message: { id: `msg_${calls}`, type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, usage: { input_tokens: 8, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } }) + event('content_block_start', { type: 'content_block_start', index: 0, content_block: block }) + event('content_block_delta', { type: 'content_block_delta', index: 0, delta }) + event('content_block_stop', { type: 'content_block_stop', index: 0 }) + event('message_delta', { type: 'message_delta', delta: { stop_reason: first ? 'tool_use' : 'end_turn', stop_sequence: null }, usage: { output_tokens: 3 } }) + event('message_stop', { type: 'message_stop' }))
    })
  })
  try {
    await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
    const address = server.address(); assert.ok(address && typeof address !== 'string')
    for (active of cases) {
      for (const executable of [...(reference ? [reference] : []), 'bun']) {
        calls = 0; toolResult = undefined
        for (const output of [join(cwd, 'created.txt'), join(outside, 'created.txt')]) rmSync(output, { force: true })
        writeFileSync(join(cwd, '.claude', 'settings.json'), JSON.stringify({ permissions: active.project ?? {} }))
        const permissions = { blockReadsOutsideWorkingDirectories: true, blockWritesOutsideWorkingDirectories: true, ...active.flags }
        const tool = active.tool
        const args = ['--bare', '-p', 'Perform the requested file operation.', '--model', 'claude-opus-4-6', '--tools', tool, '--allowedTools', tool, '--settings', JSON.stringify({ permissions }), '--output-format', 'json']
        const env = { ...process.env, HOME: join(dir, 'home'), CLAUDE_CONFIG_DIR: join(dir, 'config'), ANTHROPIC_API_KEY: 'sk-local-fence', ANTHROPIC_BASE_URL: `http://127.0.0.1:${address.port}`, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', DISABLE_TELEMETRY: '1', CI: '1' }
        const result = await new Promise<{ code: number | null; out: string; err: string }>((done, reject) => {
          const child = spawn(executable, executable === 'bun' ? [resolve('dist/cli.js'), ...args] : args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
          let out = '', err = ''; const timer = setTimeout(() => child.kill('SIGKILL'), 20000)
          child.stdout.on('data', x => { out += x }); child.stderr.on('data', x => { err += x })
          child.on('error', e => { clearTimeout(timer); reject(e) }); child.on('close', code => { clearTimeout(timer); done({ code, out, err }) })
        })
        assert.equal(result.code, 0, `${active.name} ${executable}: ${result.out} ${result.err}`)
        assert.equal(calls, 2, active.name); assert.ok(toolResult, active.name)
        assert.equal(toolResult.is_error === true, !active.allowed, `${active.name} ${executable}: ${JSON.stringify(toolResult)}`)
        if (active.tool === 'Read' && !active.allowed) assert.doesNotMatch(JSON.stringify(toolResult), /PRIVATE_317_BYTES/)
        if (active.tool === 'Edit' && active.allowed) assert.equal(readFileSync(active.path, 'utf8'), 'CREATED_317_BYTES')
        if (active.tool === 'Edit' && !active.allowed) assert.throws(() => readFileSync(active.path), { code: 'ENOENT' })
      }
    }
  } finally {
    server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); rmSync(dir, { recursive: true, force: true })
  }
})
