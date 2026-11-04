import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  replaceTranscriptAtomically,
  replaceTranscriptBatchAtomically,
  assertSafeAgentTranscriptId,
} from '../src/utils/atomicTranscriptRestore317.mjs'

function withDir(fn) {
  const root = mkdtempSync(join(tmpdir(), 'ccr317-restore-'))
  return Promise.resolve().then(() => fn(root)).finally(() => {
    rmSync(root, { recursive: true, force: true })
  })
}

test('CCR v1 restore publishes complete JSONL and does not leave temporary files', () => withDir(async root => {
  const path = join(root, 'main.jsonl')
  writeFileSync(path, 'previous session\n')
  await replaceTranscriptAtomically(path, '{"uuid":"restored"}\n')
  assert.equal(readFileSync(path, 'utf8'), '{"uuid":"restored"}\n')
  assert.deepEqual(readdirSync(root), ['main.jsonl'])
  if (process.platform !== 'win32') assert.equal(statSync(path).mode & 0o777, 0o600)
}))

test('CCR v2 stages main and subagent transcripts before replacing either', () => withDir(async root => {
  const main = join(root, 'main.jsonl')
  const agent = join(root, 'agent-a.jsonl')
  writeFileSync(main, 'previous-main\n')
  writeFileSync(agent, 'previous-agent\n')
  const invalid = join(root, 'no-such-dir', 'agent-b.jsonl')
  await assert.rejects(replaceTranscriptBatchAtomically([
    { path: main, content: 'new-main\n' },
    { path: invalid, content: 'new-agent\n' },
  ]), error => error.code === 'ENOENT')
  assert.equal(readFileSync(main, 'utf8'), 'previous-main\n')
  assert.equal(readFileSync(agent, 'utf8'), 'previous-agent\n')
  assert.deepEqual(readdirSync(root).sort(), ['agent-a.jsonl', 'main.jsonl'])
}))

test('CCR v2 commits main and multiple subagents using complete JSONL', () => withDir(async root => {
  const paths = ['main', 'agent-a', 'agent-b'].map(name => join(root, name + '.jsonl'))
  for (const path of paths) writeFileSync(path, 'old\n')
  await replaceTranscriptBatchAtomically(paths.map((path, i) => ({
    path, content: '{"index":' + i + '}\n',
  })))
  for (const [i, path] of paths.entries()) {
    assert.equal(readFileSync(path, 'utf8'), '{"index":' + i + '}\n')
  }
  assert.equal(readdirSync(root).filter(x => x.endsWith('.tmp')).length, 0)
}))

test('CCR remote subagent IDs are filename-safe including named teammates', () => {
  for (const id of ['a1234567890abcdef', 'researcher@my-project', 'worker_02']) {
    assert.equal(assertSafeAgentTranscriptId(id), id)
  }
  for (const id of ['../escape', 'abc/def', 'abc\\def', 'C:windows', '..\\bad', '', 'a\u0000b', 123]) {
    assert.throws(() => assertSafeAgentTranscriptId(id), /Invalid remote agent/)
  }
})
