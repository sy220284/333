/**
 * Plugin eval's actual model execution adapter.
 * Each arm runs a separate rebuilt Claude CLI child and preserves every SDK
 * stream event for trace-based graders. Budget/cancellation/errors propagate.
 */
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const MAX_STDOUT_BYTES = 32 * 1024 * 1024

function cliInvocation() {
  const entry = process.argv[1] ? resolve(process.argv[1]) : undefined
  if (entry && /\.(?:[cm]?js|tsx?)$/.test(entry) &&
    (process.platform === 'win32' ? entry.toLowerCase() !== resolve(process.execPath).toLowerCase() : entry !== resolve(process.execPath))) {
    return [process.execPath, entry]
  }
  return [process.execPath]
}

function stdoutText(events) {
  const last = [...events].reverse().find(event =>
    event.type === 'result' && typeof event.result === 'string')
  if (last) return last.result
  for (const event of [...events].reverse()) {
    if (event.type !== 'assistant') continue
    const blocks = event.message?.content
    if (Array.isArray(blocks)) {
      const text = blocks.filter(x => x.type === 'text').map(x => x.text).join('\n')
      if (text) return text
    }
  }
  return ''
}
export async function runEvalModel317({
  prompt, workspace, pluginDir, model, timeoutSeconds = 300,
  allowedTools = [], disallowedTools = [], appendSystemPrompt,
  maxBudgetUsd, env = {},
}) {
  if (typeof prompt !== 'string' || !prompt.trim()) {
    throw new Error('eval model execution requires a nonempty prompt')
  }
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 3600) {
    throw new Error('eval timeout_seconds must be between 1 and 3600')
  }
  const args = [
    '-p', prompt, '--output-format', 'stream-json', '--verbose',
    '--no-session-persistence',
  ]
  if (pluginDir) args.push('--plugin-dir', pluginDir)
  if (model) args.push('--model', model)
  if (appendSystemPrompt) args.push('--append-system-prompt', appendSystemPrompt)
  if (maxBudgetUsd !== undefined) args.push('--max-budget-usd', String(maxBudgetUsd))
  if (allowedTools.length) args.push('--allowedTools', ...allowedTools)
  if (disallowedTools.length) args.push('--disallowedTools', ...disallowedTools)
  const [command, ...prefix] = cliInvocation()
  const child = spawn(command, [...prefix, ...args], {
    cwd: workspace,
    env: { ...process.env, ...env },
    stdio: ['ignore','pipe','pipe'],
    windowsHide: true,
    timeout: timeoutSeconds * 1000,
  })
  const exitPromise = new Promise((done, fail) => {
    child.once('close', (code, signal) => done({ code, signal }))
    child.once('error', fail)
  })
  const chunks = [], errors = []
  let total = 0
  const stdout = (async () => {
    for await (const chunk of child.stdout) {
      total += chunk.length
      if (total > MAX_STDOUT_BYTES) {
        child.kill()
        throw new Error('eval model stream exceeded 32 MiB')
      }
      chunks.push(chunk)
    }
  })()
  const stderr = (async () => {
    for await (const chunk of child.stderr) {
      if (errors.reduce((sum, x) => sum + x.length, 0) < 65536) errors.push(chunk)
    }
  })()
  await Promise.all([stdout, stderr])
  const exit = await exitPromise
  const text = Buffer.concat(chunks).toString('utf8')
  const events = []
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    let event
    try { event = JSON.parse(line) }
    catch (error) {
      throw new Error('eval model produced invalid JSON stream: ' + error)
    }
    events.push(event)
  }
  const result = [...events].reverse().find(event => event.type === 'result')
  const costUsd = Number(result?.total_cost_usd ?? result?.cost_usd ?? 0)
  const message = stdoutText(events)
  const error = exit.code === 0 ? undefined :
    String(result?.error ?? Buffer.concat(errors).toString('utf8') ||
      'model execution exited with ' + (exit.code ?? exit.signal))
  return {
    lastMessage: message, trace: events,
    costUsd: Number.isFinite(costUsd) ? costUsd : 0,
    exitCode: exit.code, error,
  }
}

export async function judgeEvalOutput317({ grader, output, context }, options = {}) {
  const reference = grader.type === 'baseline'
    ? `Reference answer: ${String(context.baseline ?? '')}\n`
    : ''
  const instruction = [
    'Evaluate the model answer against the precise rubric below.',
    'Respond ONLY with JSON of shape {"score": <number between 0 and 1>, "reason": "<brief evidence>"}.',
    'Score must describe outcome quality, not whether the plugin was invoked.',
    'Rubric:', grader.criteria, reference,
    'Answer:', output,
  ].join('\n')
  const result = await runEvalModel317({
    prompt: instruction,
    workspace: options.workspace ?? context.workspace,
    model: options.judgeModel ?? 'haiku',
    timeoutSeconds: options.timeoutSeconds ?? 120,
    allowedTools: [],
    disallowedTools: ['Bash','Write','Edit','WebFetch','Agent'],
  })
  if (result.error) throw new Error('eval judge model failed: ' + result.error)
  const raw = result.lastMessage.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, '').trim()
  let grade
  try { grade = JSON.parse(raw) }
  catch { throw new Error('eval judge model returned non-JSON verdict') }
  if (typeof grade.score !== 'number' || grade.score < 0 || grade.score > 1) {
    throw new Error('eval judge model returned an invalid score')
  }
  return { score: grade.score, reason: String(grade.reason ?? ''), costUsd: result.costUsd }
}
