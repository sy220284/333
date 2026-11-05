import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  remoteSessionUuid,
  resolveInitialSessionId,
  shouldIsolateChildSession,
} from '../src/utils/remoteSessionIdentity.mjs'

const remote = 'shared-session-xyz'
const expected = '5895c78b-8662-577a-9653-a9820deac56d'
const args = ['bun', 'claude', '-p', 'hello']
const fixed = () => 'aabbccdd-0000-4000-8000-000000000001'

test('317 remote session identity reproduces the official native UUIDv5', () => {
  assert.equal(remoteSessionUuid(remote), expected)
  assert.equal(remoteSessionUuid('  '+remote+'\n'), expected)
  assert.equal(remoteSessionUuid(''), null)
  assert.equal(remoteSessionUuid(' \n '), null)
  assert.equal(resolveInitialSessionId({CLAUDE_CODE_REMOTE_SESSION_ID: remote}, args, fixed), expected)
  assert.equal(resolveInitialSessionId({}, args, fixed), fixed())
})

test('317 embedded child print sessions isolate transcript IDs from parent remote sessions', () => {
  const env = {CLAUDE_CODE_REMOTE_SESSION_ID: remote, CLAUDE_CODE_CHILD_SESSION: '1'}
  assert.equal(shouldIsolateChildSession(env,args), true)
  assert.equal(resolveInitialSessionId(env,args,fixed), fixed())
  assert.notEqual(resolveInitialSessionId(env,args,fixed), expected)
  for (const enabled of ['TRUE', 'yes', 'On']) {
    assert.equal(resolveInitialSessionId({...env, CLAUDE_CODE_CHILD_SESSION:enabled},args,fixed),fixed())
  }
  for (const disabled of ['0', 'false', 'off']) {
    assert.equal(resolveInitialSessionId({...env, CLAUDE_CODE_CHILD_SESSION:disabled},args,fixed),expected)
  }
})

test('317 compatibility switch explicitly restores remote identity inheritance', () => {
  const base = {CLAUDE_CODE_REMOTE_SESSION_ID:remote, CLAUDE_CODE_CHILD_SESSION:'true'}
  for (const value of ['1','true','YES','on']) {
    assert.equal(resolveInitialSessionId({...base,CLAUDE_CODE_DISABLE_NESTED_SESSION_ID:value},args,fixed),expected)
  }
  assert.equal(resolveInitialSessionId({...base,CLAUDE_CODE_DISABLE_NESTED_SESSION_ID:'false'},args,fixed),fixed())
})

test('317 SDK and MCP serve sessions keep their server-assigned identity', () => {
  const env = {CLAUDE_CODE_REMOTE_SESSION_ID:remote, CLAUDE_CODE_CHILD_SESSION:'1'}
  for (const argv of [
    ['bun','claude','-p','test','--sdk-url','wss://localhost/example'],
    ['bun','claude','--sdk-url=wss://localhost/example','-p','test'],
    ['bun','claude','mcp','serve'],
  ]) {
    assert.equal(shouldIsolateChildSession(env,argv),false,argv.join(' '))
    assert.equal(resolveInitialSessionId(env,argv,fixed),expected,argv.join(' '))
  }
  assert.equal(shouldIsolateChildSession(env,['bun','claude','-p','test','--','--sdk-url','foo']),true)
  assert.equal(shouldIsolateChildSession(env,['bun','claude','--sdk-url=','-p','test']),true)
})

test('317 identity policy is wired into the session bootstrap, not only helper tests', () => {
  const source = readFileSync(new URL('../src/bootstrap/state.ts',import.meta.url),'utf8')
  assert.match(source, /import \{ resolveInitialSessionId \} from 'src\/utils\/remoteSessionIdentity\.ts'/)
  assert.match(source, /sessionId: resolveInitialSessionId\(\) as SessionId/)
  assert.match(source, /STATE\.sessionId = randomUUID\(\) as SessionId/)
})
