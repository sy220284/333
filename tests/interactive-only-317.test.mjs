import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { getInteractiveOnlyError317, INTERACTIVE_ONLY_FLAGS_317 } from '../src/entrypoints/interactiveOnly317.ts'

const tty = { stdinIsTTY: true, stdoutIsTTY: true }
const detached = { stdinIsTTY: false, stdoutIsTTY: false }

test('交互会话和带初始问题的交互会话仍可启动', () => {
  assert.equal(getInteractiveOnlyError317([], tty), null)
  assert.equal(getInteractiveOnlyError317(['写一个单元测试'], tty), null)
  assert.equal(getInteractiveOnlyError317(['--model', 'sonnet', '完成代码审查'], tty), null)
  assert.equal(getInteractiveOnlyError317(['--continue'], tty), null)
  assert.equal(getInteractiveOnlyError317(['--resume'], tty), null)
  assert.equal(getInteractiveOnlyError317(['--', '--print'], tty), null)
  assert.equal(getInteractiveOnlyError317(['--system-prompt', '--print'], tty), null)
})

test('所有无界面对话命令及等号形式均被拒绝', () => {
  for (const flag of INTERACTIVE_ONLY_FLAGS_317) {
    assert.match(getInteractiveOnlyError317([flag], tty) ?? '', /已移除非交互模式/, flag)
    assert.match(getInteractiveOnlyError317([flag + '=1'], tty) ?? '', /已移除非交互模式/, flag + '=1')
  }
  for (const flags of [['-p'], ['-p你好'], ['-vp'], ['--print=false'], ['--output-format', 'stream-json'], ['--sdk-url', 'ws://localhost']]) {
    assert.match(getInteractiveOnlyError317(flags, tty) ?? '', /已移除非交互模式/, flags.join(' '))
  }
})

test('没有输入或输出终端时拒绝普通会话', () => {
  assert.match(getInteractiveOnlyError317([], detached) ?? '', /仅支持交互式会话/)
  assert.match(getInteractiveOnlyError317(['你好'], { stdinIsTTY: false, stdoutIsTTY: true }) ?? '', /仅支持交互式会话/)
  assert.match(getInteractiveOnlyError317(['你好'], { stdinIsTTY: true, stdoutIsTTY: false }) ?? '', /仅支持交互式会话/)
})

test('帮助、管理命令、MCP、内部服务进程不受交互终端约束', () => {
  for (const args of [
    ['--help'], ['--version'], ['-v'], ['--desktop'], ['--desktop', '--resume'],
    ['mcp', 'list'], ['plugin', 'list'], ['auth', 'status'],
    ['doctor'], ['gateway', '--help'], ['self-hosted-runner', 'doctor'],
    ['--daemon-worker', 'message'], ['--bg-pty-host'], ['--preload'],
  ]) {
    assert.equal(getInteractiveOnlyError317(args, detached), null, args.join(' '))
  }
})

test('模式开关不能从其他选项的值和双破折号后的提示词误判', () => {
  assert.equal(getInteractiveOnlyError317(['--model', '--print'], tty), null)
  assert.equal(getInteractiveOnlyError317(['--', '--sdk-url'], tty), null)
  assert.match(getInteractiveOnlyError317(['--model', 'sonnet', '--print'], tty) ?? '', /已移除非交互模式/)
})

test('生产入口确实拦截非交互调用，主执行入口不再运行 Headless', () => {
  const entry = readFileSync(new URL('../src/entrypoints/cli.tsx', import.meta.url), 'utf8')
  const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8')
  const sdk = readFileSync(new URL('../src/entrypoints/sdk/sessionRuntime317.ts', import.meta.url), 'utf8')
  assert.match(entry, /getInteractiveOnlyError317\(args/)
  assert.match(main, /getInteractiveOnlyError317\(process\.argv\.slice\(2\)/)
  assert.doesNotMatch(main, /await runHeadless\(/)
  assert.doesNotMatch(main, /await import\('src\/cli\/print\.js'\)/)
  assert.match(main, /INTERACTIVE_ONLY_FLAGS_317\.has\(option\.long\)/)
  assert.match(sdk, /SDK 无界面对话模式/)
})
