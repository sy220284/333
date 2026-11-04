import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { test } from 'node:test'
import {
  shouldProtectRelayToken317, guardRelayTokenDescriptor317,
} from '../src/bootstrap/relayTokenGuard317.mjs'

const remote = { CLAUDE_CODE_REMOTE: 'true', CCR_AGENT_PROXY_TOKEN_FILE_DESCRIPTOR: '5' }
const argv = (...args) => ['bun', 'claude', 'mcp', 'serve', ...args]

test('M1 C19-T02: 317 only protects remote HTTP MCP startup with secret file descriptor or tunnel', () => {
  for (const flags of [
    ['--transport=http'],
    ['--transport', 'http', '--session-tunnel'],
    ['--transport=http', '--port', '1234'],
    ['--transport=http', '--result-format=raw', '--debug'],
    ['--transport=http', '--port=1234', 'rendered', '--verbose'],
  ]) assert.equal(shouldProtectRelayToken317(argv(...flags), remote), true, flags.join(' '))
  assert.equal(shouldProtectRelayToken317(argv('--transport=http', '--session-tunnel'),
    { CLAUDE_CODE_REMOTE: '1' }), true)
  for (const args of [
    argv('--transport=stdio'),
    argv('--transport', 'stdio'),
    argv('--transport=http', '--malicious'),
    argv('--transport=http', '--port=bad'),
    argv('--transport=http', '--port=1234', '--unexpected'),
    ['bun', 'claude', 'mcp', 'add', '--transport=http'],
    ['bun', 'claude', 'plugin', 'eval', '--transport=http'],
  ]) assert.equal(shouldProtectRelayToken317(args, remote), false, args.join(' '))
  assert.equal(shouldProtectRelayToken317(argv('--transport=http'),
    { ...remote, CLAUDE_CODE_REMOTE: 'false' }), false)
  assert.equal(shouldProtectRelayToken317(argv('--transport=http'),
    { ...remote, CLAUDE_CODE_ENVIRONMENT_KIND: 'hosted' }), false)
  assert.equal(shouldProtectRelayToken317(argv('--transport=http'),
    { CLAUDE_CODE_REMOTE: 'yes' }), false)
})

test('M1 C19-T02: official Bun.ant protection sets dumpability to false', async () => {
  const calls = []
  const result = await guardRelayTokenDescriptor317({
    argv: argv('--transport=http', '--port=3000'),
    env: remote,
    platform: 'linux',
    bun: { ant: { setDumpable: value => { calls.push(value); return true } } },
    ffiLoader: () => { throw Error('FFI must not run when official syscall is available') },
  })
  assert.equal(result, true)
  assert.deepEqual(calls, [false])
  await assert.rejects(guardRelayTokenDescriptor317({
    argv: argv('--transport=http'),
    env: remote,
    platform: 'linux',
    bun: { ant: { setDumpable: () => false } },
  }), /Cannot disable Linux process dumpability/)
})

test('M1 C19-T02: standard Bun executes prctl(PR_SET_DUMPABLE,0), and fails closed on syscall errors', async () => {
  const calls = []
  let closed = false
  const loader = async () => ({
    FFIType: { i32: 'i32' },
    dlopen: (library, spec) => {
      assert.equal(library, 'libc.so.6')
      assert.deepEqual(spec.prctl.args, ['i32','i32','i32','i32','i32'])
      return {
        symbols: { prctl: (...values) => { calls.push(values); return 0 } },
        close: () => { closed = true },
      }
    },
  })
  const accepted = await guardRelayTokenDescriptor317({
    argv: argv('--transport=http'), env: remote, platform: 'linux',
    bun: {}, ffiLoader: loader,
  })
  assert.equal(accepted, true)
  assert.deepEqual(calls, [[4, 0, 0, 0, 0]])
  assert.equal(closed, true)
  await assert.rejects(guardRelayTokenDescriptor317({
    argv: argv('--transport=http'), env: remote, platform: 'linux',
    bun: {}, ffiLoader: async () => ({
      FFIType: { i32: 'i32' },
      dlopen: () => ({
        symbols: { prctl: () => -1 },
        close: () => {},
      }),
    }),
  }), /prctl\(PR_SET_DUMPABLE, 0\) failed/)
})

test('M1 C19-T02: no secret remote HTTP mode means no process-level protection invoked', async () => {
  assert.equal(await guardRelayTokenDescriptor317({
    argv: argv('--transport=stdio'), env: remote, platform: 'linux',
    bun: { ant: { setDumpable: () => { throw Error('unauthorized syscall') } } },
  }), false)
})

test('M1 C19-T02: Bun Linux kernel actually marks remote MCP token process non-dumpable', {
  skip: process.platform !== 'linux',
}, () => {
  const script = [
    'import { dlopen, FFIType } from "bun:ffi";',
    'import { guardRelayTokenDescriptor317 } from "./src/bootstrap/relayTokenGuard317.mjs";',
    'const libc=dlopen("libc.so.6",{prctl:{args:Array(5).fill(FFIType.i32),returns:FFIType.i32}});',
    'const initial=libc.symbols.prctl(3,0,0,0,0);',
    'const applied=await guardRelayTokenDescriptor317({',
    '  argv:["bun","claude","mcp","serve","--transport=http","--session-tunnel"],',
    '  env:{CLAUDE_CODE_REMOTE:"true"},platform:"linux",',
    '});',
    'const final=libc.symbols.prctl(3,0,0,0,0);',
    'libc.close();',
    'console.log(JSON.stringify({initial,final,applied}));',
    'if(!applied||final!==0)process.exit(2);',
  ].join('\n')
  const res = spawnSync('bun', ['-e', script], {
    cwd: resolve(import.meta.dirname, '..'),
    encoding: 'utf8', timeout: 12_000,
  })
  assert.equal(res.error, undefined, String(res.error))
  assert.equal(res.status, 0, res.stderr)
  const output = JSON.parse(res.stdout.trim())
  assert.equal(output.applied, true)
  assert.equal(output.final, 0)
})
