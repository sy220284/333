import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseDesktopCliOptions, validateDesktopInvocation } from '../src/cli/desktop/launch.mjs'

const valid = {
  argv: ['--desktop'], stdoutIsTTY: true, stdinIsTTY: true, env: {},
}

test('desktop clean interactive startup permits new, continue and UUID resume entry', () => {
  assert.equal(validateDesktopInvocation(valid), null)
  assert.equal(validateDesktopInvocation({ ...valid, argv: ['--desktop', '--continue'] }), null)
  assert.equal(validateDesktopInvocation({ ...valid, argv: ['--desktop', '--resume', '123e4567-e89b-42d3-a456-426614174000'] }), null)
  assert.equal(validateDesktopInvocation({ ...valid, argv: ['--desktop', '--debug-file', '/tmp/trace'] }), null)
})

test('desktop rejects print, SDK and redirected output before any desktop action', () => {
  for (const args of [['--desktop', '--print'], ['--desktop', '-p'], ['--desktop', '--sdk-url', 'ws://localhost'], ['--desktop', '--init-only']]) {
    assert.match(validateDesktopInvocation({ ...valid, argv: args }), /can't run non-interactively/)
  }
  assert.match(validateDesktopInvocation({ ...valid, stdoutIsTTY: false }), /can't run non-interactively/)
})

test('desktop rejects conflicting flags, restricted environment, prompts and redirected input', () => {
  assert.match(validateDesktopInvocation({ ...valid, argv: ['--desktop', '--model', 'opus'] }), /can't be combined with/)
  assert.match(validateDesktopInvocation({ ...valid, env: { CLAUDE_CODE_SIMPLE: '1' } }), /bare mode/)
  assert.match(validateDesktopInvocation({ ...valid, env: { CLAUDE_CODE_RESTRICTED: 'true' } }), /restricted session/)
  assert.match(validateDesktopInvocation({ ...valid, prompt: 'write something' }), /doesn't take a prompt/)
  assert.match(validateDesktopInvocation({ ...valid, stdinIsTTY: false }), /piped or redirected input/)
})

test('desktop precedence follows official startup checks for invalid combinations', () => {
  const result = validateDesktopInvocation({
    ...valid, argv: ['--desktop', '--print', '--model', 'opus'], env: { CLAUDE_CODE_SIMPLE: '1' },
    prompt: 'hello', stdinIsTTY: false,
  })
  assert.match(result, /can't run non-interactively/)
})

test('desktop bootstrap argument extraction matches new and resumed session entry paths', () => {
  assert.deepEqual(parseDesktopCliOptions(['--desktop']), { options: {}, prompt: undefined })
  assert.deepEqual(parseDesktopCliOptions(['--desktop', '--continue']), { options: { continue: true }, prompt: undefined })
  assert.deepEqual(parseDesktopCliOptions(['--desktop', '--resume', '123e4567-e89b-42d3-a456-426614174000']), {
    options: { resume: '123e4567-e89b-42d3-a456-426614174000' }, prompt: undefined,
  })
  assert.deepEqual(parseDesktopCliOptions(['--desktop', '--resume']), { options: { resume: true }, prompt: undefined })
  assert.deepEqual(parseDesktopCliOptions(['--desktop', '--debug-file', '/tmp/trace']), { options: {}, prompt: undefined })
  assert.deepEqual(parseDesktopCliOptions(['--desktop', 'write', 'test']), { options: {}, prompt: 'write test' })
  assert.deepEqual(parseDesktopCliOptions(['--desktop', '--model', 'opus']), { options: {}, prompt: undefined })
})
