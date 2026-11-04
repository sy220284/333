import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getCliFlagValue, hasCliFlag, isStreamJsonLaunch, rejectDeepLinkArgumentInjection, backgroundSessionVerbIndex317 } from '../src/utils/cliArgv317.mjs'
import { classifyStartupArgs } from '../src/entrypoints/startupRouting317.mjs'

test('317 early configuration parsing chooses the final actual flag and stops at --', () => {
  assert.equal(getCliFlagValue('--settings', ['--settings', 'a', '--settings=b']), 'b')
  assert.equal(getCliFlagValue('--settings', ['--', '--settings', 'prompt-text']), undefined)
  assert.equal(getCliFlagValue('--settings', ['--system-prompt', '--settings', 'text']), undefined)
  assert.equal(getCliFlagValue('--settings', ['--tools', 'Read', '--settings=config']), 'config')
  assert.equal(getCliFlagValue('--model', ['--mcp-config', 'one', 'two', '--model', 'sonnet']), 'sonnet')
  assert.equal(getCliFlagValue('--model', ['--resume', 'session', '--model=haiku']), 'haiku')
})
test('317 flag presence does not mistake flag values or prompt text for switches', () => {
  for (const flag of ['--desktop', '--bare', '--print', '--restricted', '--safe-mode']) {
    assert.equal(hasCliFlag(flag, ['--system-prompt', flag]), false)
    assert.equal(hasCliFlag(flag, ['--', flag]), false)
    assert.equal(hasCliFlag(flag, [flag]), true)
  }
  assert.equal(isStreamJsonLaunch(['-p', '--output-format=stream-json']), true)
  assert.equal(isStreamJsonLaunch(['-p', '--', '--output-format=stream-json']), false)
})
test('OS deep-link invocation rejects arguments appended after its URI', () => {
  assert.equal(rejectDeepLinkArgumentInjection(['--model', 'sonnet', '--handle-uri', 'claude://open']), null)
  assert.match(rejectDeepLinkArgumentInjection(['--handle-uri', 'claude://open', '--settings', 'bad']), /argument injection/)
  assert.equal(rejectDeepLinkArgumentInjection(['--handle-uri']), null)
})

test('startup failure records preserve 317 result/session semantics', async () => {
  const { buildStartupFailureResult, startupResultSessionId, getStartupCwdError } = await import('../src/utils/cliStartupFailure.mjs')
  const id = '11111111-1111-4111-8111-111111111111'
  assert.equal(startupResultSessionId('fallback', ['--session-id', id]), id)
  assert.equal(startupResultSessionId('fallback', ['--session-id', 'bad']), 'fallback')
  assert.equal(startupResultSessionId('fallback', ['--sdk-url=x', '--session-id', 'remote-session']), 'remote-session')
  const record = buildStartupFailureResult({ sessionId: id, message: 'failure', reason: 'cwd_unavailable' })
  assert.equal(record.session_id, id); assert.equal(record.result_index, 0); assert.equal(record.startup_failure_reason, 'cwd_unavailable')
  assert.equal(record.is_error, true); assert.deepEqual(record.errors, ['failure']); assert.equal(record.usage.input_tokens, 0)
  assert.equal('result_index' in buildStartupFailureResult({ sessionId: id, message: '', resultIndex: null }), false)
  assert.match(getStartupCwdError(() => { throw Object.assign(new Error('gone'), { code: 'ENOENT' }) }), /current directory no longer exists/)
  assert.equal(getStartupCwdError(() => '/existing'), undefined)
})

test('startup framing obeys opt-in, stream format, wire escaping and flush errors', async () => {
  const { Writable } = await import('node:stream')
  const { writeStartupFailureResult, writeStartupFrames } = await import('../src/utils/cliStartupFailure.mjs')
  let output = ''
  const stdout = new Writable({ write(chunk, _encoding, done) { output += chunk; done() } })
  const input = { sessionId: 'fallback', message: 'bad\u0085\u2028value', reason: 'cwd_unavailable' }
  const argv = ['-p', '--output-format=stream-json']
  assert.equal(await writeStartupFailureResult(input, { argv, env: {}, stdout }), false)
  assert.equal(output, '')
  assert.equal(await writeStartupFailureResult(input, { argv, env: { CLAUDE_CODE_STARTUP_FAILURE_RESULTS: 'yes' }, stdout }), true)
  assert.ok(output.includes('\\u0085')); assert.ok(output.includes('\\u2028'))
  assert.equal(JSON.parse(output).errors[0], input.message)
  output = ''
  assert.equal(await writeStartupFailureResult({ ...input, reason: 'org_config_refused' }, { argv, env: {}, stdout }), true)
  assert.equal(JSON.parse(output).startup_failure_reason, 'org_config_refused')
  assert.equal(await writeStartupFrames([], { argv: ['-p', '--output-format=text'], stdout }), false)
  const broken = new Writable({ write(_chunk, _encoding, done) { done(new Error('broken pipe')) } })
  assert.equal(await writeStartupFrames([{}], { argv, stdout: broken }), false)
})

test('317 bootstrap recognizes session verbs after safe root options, matching official argv contracts', () => {
  const valid = [
    [['logs', 'deadbeef'], 0],
    [['--settings={}', 'logs', 'deadbeef'], 1],
    [['--model', 'sonnet', 'logs', 'deadbeef'], 2],
    [['--settings', '{}', '--desktop', 'stop', 'deadbeef'], 3],
    [['--verbose', '--settings={}', 'respawn', '--all'], 2],
  ]
  for (const [argv, index] of valid) {
    assert.equal(backgroundSessionVerbIndex317(argv), index, argv.join(' '))
    assert.equal(classifyStartupArgs(argv).sessionVerbIndex, index)
    assert.equal(classifyStartupArgs(argv).backgroundRequest, true)
  }
  for (const argv of [
    ['--model', 'logs', 'deadbeef'],
    ['--settings={}', 'logs', 'missing'],
    ['--settings={}', 'logs'],
    ['--settings={}', '--', 'logs', 'deadbeef'],
    ['--print', 'logs', 'deadbeef'],
    ['--settings={}', '--routine=test', 'stop', 'deadbeef'],
    ['--settings={}', '--exec', 'stop', 'deadbeef'],
    ['--settings={}', 'stop', 'DEADBEEF'],
    ['--desktop', '--system-prompt', '--bg'],
  ]) {
    assert.equal(backgroundSessionVerbIndex317(argv), -1, argv.join(' '))
  }
  assert.equal(classifyStartupArgs(['--settings={}', 'logs', 'missing']).backgroundRequest, false)
  assert.equal(classifyStartupArgs(['--system-prompt', '--bg']).backgroundRequest, false)
})
