import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

function response(model, block) {
  const tool = block.type === 'tool_use'
  return [
    [
      'message_start',
      {
        type: 'message_start',
        message: {
          id: `msg_${block.id ?? 'done'}`,
          type: 'message',
          role: 'assistant',
          model,
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 8, output_tokens: 0 },
        },
      },
    ],
    [
      'content_block_start',
      {
        type: 'content_block_start',
        index: 0,
        content_block: tool
          ? { ...block, input: {} }
          : { type: 'text', text: '' },
      },
    ],
    [
      'content_block_delta',
      {
        type: 'content_block_delta',
        index: 0,
        delta: tool
          ? {
              type: 'input_json_delta',
              partial_json: JSON.stringify(block.input),
            }
          : { type: 'text_delta', text: block.text },
      },
    ],
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    [
      'message_delta',
      {
        type: 'message_delta',
        delta: {
          stop_reason: tool ? 'tool_use' : 'end_turn',
          stop_sequence: null,
        },
        usage: { output_tokens: 4 },
      },
    ],
    ['message_stop', { type: 'message_stop' }],
  ]
    .map(
      ([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
    )
    .join('')
}
const delay = ms => new Promise(done => setTimeout(done, ms))
function alive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (error.code === 'ESRCH') return false
    throw error
  }
}

async function verify(executable, parameter, toolName) {
  const home = mkdtempSync(join(tmpdir(), '333-stop-cli-'))
  let requests = 0,
    taskId,
    stopResult,
    pid,
    stoppedBeforeFinal = false
  let child
  const server = createServer(async (req, res) => {
    if (!req.url?.startsWith('/v1/messages')) {
      res.writeHead(404)
      res.end()
      return
    }
    let raw = ''
    for await (const chunk of req) raw += chunk
    const body = JSON.parse(raw)
    requests++
    const results = body.messages
      .flatMap(m => (Array.isArray(m.content) ? m.content : []))
      .filter(b => b.type === 'tool_result')
    let block
    if (requests === 1)
      block = {
        type: 'tool_use',
        id: 'start_shell',
        name: 'Bash',
        input: {
          command: 'echo $$ > child.pid; exec sleep 60',
          run_in_background: true,
          description: 'stop fixture',
        },
      }
    else if (requests === 2) {
      taskId = JSON.stringify(
        results.find(b => b.tool_use_id === 'start_shell'),
      ).match(/background with ID: ([a-z0-9]+)/)?.[1]
      if (existsSync(join(home, 'child.pid')))
        pid = Number(readFileSync(join(home, 'child.pid'), 'utf8').trim())
      block = taskId
        ? {
            type: 'tool_use',
            id: 'stop_shell',
            name: toolName,
            input: { [parameter]: taskId },
          }
        : { type: 'text', text: 'NO_BACKGROUND_TASK' }
    } else {
      stopResult = results.find(b => b.tool_use_id === 'stop_shell')
      if (pid) for (let i = 0; i < 100 && alive(pid); i++) await delay(10)
      stoppedBeforeFinal = !!pid && !alive(pid)
      block = { type: 'text', text: 'STOP_OK' }
    }
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.end(response(body.model, block))
  })
  try {
    await new Promise(done => server.listen(0, '127.0.0.1', done))
    const args = [
      '-p',
      'Perform the shell start and stop.',
      '--model',
      'sonnet',
      '--tools',
      'Bash,TaskStop',
      '--allowedTools',
      'Bash,TaskStop',
      '--no-session-persistence',
      '--output-format',
      'stream-json',
      '--verbose',
    ]
    const env = {
      ...process.env,
      HOME: home,
      CLAUDE_CONFIG_DIR: join(home, 'config'),
      ANTHROPIC_API_KEY: 'local-stop-fixture',
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${server.address().port}`,
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      DISABLE_TELEMETRY: '1',
      CI: '1',
      ENABLE_TOOL_SEARCH: 'false',
      HTTP_PROXY: '',
      HTTPS_PROXY: '',
      NO_PROXY: '127.0.0.1,localhost',
    }
    child = spawn(
      executable,
      executable === 'bun' ? [resolve('dist/cli.js'), ...args] : args,
      { cwd: home, env, stdio: ['ignore', 'pipe', 'pipe'] },
    )
    let out = '',
      err = ''
    child.stdout.on('data', x => {
      out += x
    })
    child.stderr.on('data', x => {
      err += x
    })
    const timer = setTimeout(() => child.kill('SIGKILL'), 20000)
    const code = await new Promise((done, reject) => {
      child.once('error', reject)
      child.once('close', done)
    }).finally(() => clearTimeout(timer))
    assert.equal(code, 0, out + err)
    assert.equal(requests, 3, out + err)
    assert.ok(taskId)
    assert.ok(!stopResult.is_error, JSON.stringify(stopResult))
    assert.match(
      JSON.stringify(stopResult.content),
      /Successfully stopped task/,
    )
    assert.equal(
      stoppedBeforeFinal,
      true,
      'OS child must exit before the final model response',
    )
    const events = out
      .trim()
      .split('\n')
      .map(line => JSON.parse(line))
    const terminal = events.filter(
      e =>
        e.type === 'system' &&
        e.subtype === 'task_notification' &&
        e.task_id === taskId,
    )
    assert.equal(terminal.length, 1, JSON.stringify(events))
    assert.equal(terminal[0].status, 'stopped')
  } finally {
    if (child?.exitCode === null) child.kill('SIGKILL')
    if (pid && alive(pid)) process.kill(pid, 'SIGKILL')
    server.closeAllConnections()
    await new Promise(done => server.close(done))
    rmSync(home, { recursive: true, force: true })
  }
}
for (const [toolName, parameter] of [
  ['TaskStop', 'task_id'],
  ['TaskStop', 'shell_id'],
  ['KillShell', 'shell_id'],
  ['KillBash', 'task_id'],
])
  test(`317 real shell stop via ${toolName}/${parameter}: process exits and one SDK terminal event`, {
    timeout: 45000,
    skip:
      process.platform === 'win32'
        ? 'POSIX process IDs; Windows process-tree parity is tracked separately'
        : false,
  }, async () => {
    await verify('bun', parameter, toolName)
    const reference =
      process.env.CLAUDE_CODE_317_REFERENCE ?? process.env.CLAUDE_TARGET_X64
    if (reference) await verify(reference, parameter, toolName)
  })
