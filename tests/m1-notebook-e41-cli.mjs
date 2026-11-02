import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// Fully local, repeatable E41 acceptance: a fake model asks the real CLI to
// Read a notebook, NotebookEdit it, and Read it again. No network LLM needed.
//
// Usage:
//   node tests/m1-notebook-e41-cli.mjs bun dist/cli.js
//   node tests/m1-notebook-e41-cli.mjs /path/to/claude-2.1.310-linux-x64
const [executable, ...prefix] = process.argv.slice(2)
assert.ok(executable, 'Supply a real executable (and any script argument)')
// The CLI must run inside an isolated notebook directory. Resolve the
// script path against the repo before switching the child process cwd.
// A relative dist/cli.js would otherwise be loaded from the temporary cwd.
const launchPrefix =
  prefix.length > 0 && /\.(?:cjs|mjs|js|ts|tsx)$/.test(prefix[0])
    ? [resolve(process.cwd(), prefix[0]), ...prefix.slice(1)]
    : prefix
const model = 'claude-sonnet-4-6'
const temporary = mkdtempSync(join(tmpdir(), 'm1-e41-notebook-'))
const home = mkdtempSync(join(tmpdir(), 'm1-e41-home-'))
const notebook_path = join(temporary, 'real.ipynb')
writeFileSync(notebook_path, JSON.stringify({
  nbformat: 4,
  nbformat_minor: 5,
  metadata: { language_info: { name: 'python' } },
  cells: [{
    cell_type: 'code',
    id: 'stable-cell',
    source: 'print(1)',
    metadata: {},
    execution_count: null,
    outputs: [],
  }],
}))

const convertToMarkdown = process.env.M1_NOTEBOOK_E41_MODE === 'convert'
const expectedSource = convertToMarkdown ? '# Hello' : 'print(2)'
const events = []
let requestCount = 0
const sse = (name, payload) => `event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`
const steps = [
  { name: 'Read', id: 'toolu_e41_read_before', input: { file_path: notebook_path } },
  {
    name: 'NotebookEdit',
    id: 'toolu_e41_edit',
    input: { notebook_path, cell_id: 'stable-cell', new_source: expectedSource,
      ...(convertToMarkdown ? { cell_type: 'markdown' } : {}), edit_mode: 'replace' },
  },
  { name: 'Read', id: 'toolu_e41_read_after', input: { file_path: notebook_path } },
]
const server = createServer((req, res) => {
  if (req.method === 'HEAD') {
    res.writeHead(200)
    res.end()
    return
  }
  if (req.method !== 'POST' || !req.url?.startsWith('/v1/messages')) {
    res.writeHead(404)
    res.end('Unsupported local test request')
    return
  }
  const chunks = []
  req.on('data', data => chunks.push(data))
  req.on('end', () => {
    try {
      const message = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      assert.equal(message.model, model)
      requestCount++
      const lastMessage = JSON.stringify(message.messages?.at(-1))
      if (requestCount === 2) {
        assert.match(lastMessage, /stable-cell/)
        assert.match(lastMessage, /print\(1\)/)
      }
      if (requestCount === 3) {
        assert.ok(lastMessage.includes(`Updated cell stable-cell with ${expectedSource}`))
        assert.doesNotMatch(lastMessage, /tool_use_error/)
      }
      if (requestCount === 4) {
        assert.ok(lastMessage.includes(expectedSource))
        assert.doesNotMatch(lastMessage, /Wasted call/)
      }
      events.push({
        turn: requestCount,
        availableTools: message.tools?.map(tool => tool.name) ?? [],
      })
      let blocks
      let reason = 'tool_use'
      if (requestCount <= steps.length) {
        const action = steps[requestCount - 1]
        blocks = [
          sse('content_block_start', { type: 'content_block_start', index: 0,
            content_block: { type: 'tool_use', id: action.id, name: action.name, input: {} } }),
          sse('content_block_delta', { type: 'content_block_delta', index: 0,
            delta: { type: 'input_json_delta', partial_json: JSON.stringify(action.input) } }),
          sse('content_block_stop', { type: 'content_block_stop', index: 0 }),
        ]
      } else if (requestCount === 4) {
        reason = 'end_turn'
        blocks = [
          sse('content_block_start', { type: 'content_block_start', index: 0,
            content_block: { type: 'text', text: '' } }),
          sse('content_block_delta', { type: 'content_block_delta', index: 0,
            delta: { type: 'text_delta', text: 'E41_NOTEBOOK_ROUNDTRIP_OK' } }),
          sse('content_block_stop', { type: 'content_block_stop', index: 0 }),
        ]
      } else {
        throw new Error(`Unexpected extra model turn ${requestCount}`)
      }
      const response = [
        sse('message_start', { type: 'message_start', message: {
          id: `msg_e41_${requestCount}`,
          type: 'message', role: 'assistant', model, content: [], stop_reason: null,
          stop_sequence: null, usage: { input_tokens: 8, output_tokens: 0,
            cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
        } }),
        ...blocks,
        sse('message_delta', { type: 'message_delta',
          delta: { stop_reason: reason, stop_sequence: null },
          usage: { output_tokens: 7 } }),
        sse('message_stop', { type: 'message_stop' }),
      ].join('')
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.end(response)
    } catch (error) {
      res.writeHead(400)
      res.end(String(error))
    }
  })
})

try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const env = {
    ...process.env,
    HOME: home,
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${server.address().port}`,
    ANTHROPIC_API_KEY: 'sk-333-local-fixture',
    DISABLE_TELEMETRY: '1',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    CI: 'true',
    NO_COLOR: '1',
  }
  // SIMPLE mode omits ToolSearch and deferred NotebookEdit in 2.1.310.
  // Test the actual normal-mode contract, not that intentionally smaller set.
  delete env.CLAUDE_CODE_SIMPLE
  const args = [...launchPrefix, '-p', 'Read and edit the notebook, then read it again',
    '--permission-mode', 'acceptEdits',
    '--model', model, '--output-format', 'json', '--max-turns', '4']
  const child = spawn(executable, args, { cwd: temporary, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', data => { stdout += data.toString() })
  child.stderr.on('data', data => { stderr += data.toString() })
  const timer = setTimeout(() => child.kill('SIGKILL'), 90000)
  const result = await new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('close', (code, signal) => resolve({ code, signal }))
  })
  clearTimeout(timer)
  // Report the actual CLI failure before attempting to parse JSON output.
  // An empty stdout otherwise obscures the exit status and root exception.
  assert.equal(result.code, 0, JSON.stringify({
    exit: result, modelRequests: requestCount, stderr: stderr.slice(-12000),
    stdout: stdout.slice(-4000),
  }))
  assert.ok(stdout.trim(), JSON.stringify({
    reason: 'CLI produced no JSON output', modelRequests: requestCount,
    stderr: stderr.slice(-12000),
  }))
  const disk = JSON.parse(readFileSync(notebook_path, 'utf8'))
  const output = JSON.parse(stdout.trim())
  assert.equal(requestCount, 4)
  assert.equal(output.result, 'E41_NOTEBOOK_ROUNDTRIP_OK')
  assert.equal(output.is_error, false)
  assert.equal(disk.cells[0].id, 'stable-cell')
  assert.equal(disk.cells[0].source, expectedSource)
  assert.equal(disk.cells[0].cell_type, convertToMarkdown ? 'markdown' : 'code')
  // Official 2.1.310 preserves code execution fields on a code→markdown
  // conversion, resetting their values before changing the cell type.
  if (convertToMarkdown) {
    assert.equal(disk.cells[0].execution_count, null)
    assert.deepEqual(disk.cells[0].outputs, [])
  }
  console.log(JSON.stringify({
    scenario: 'E41', mode: convertToMarkdown ? 'convert' : 'replace',
    passed: true, modelRequests: requestCount,
    observedTools: events[0]?.availableTools,
    sourceBefore: 'print(1)', sourceAfter: disk.cells[0].source,
  }, null, 2))
} finally {
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
  rmSync(temporary, { recursive: true, force: true })
  rmSync(home, { recursive: true, force: true })
}
