import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { test } from 'node:test'
import {
  parseRunnerDeclaration, runnerDeclarationArgument, adoptRunnerDeclaration,
  DECLARES_DIFF_FINDS_NESTED_REPOSITORY as NESTED,
  DECLARES_NO_REPOSITORY_CHECKED_OUT as ABSENT,
} from '../src/entrypoints/runnerDeclaration317.mjs'

const root = resolve(import.meta.dirname, '..')
test('M1 C19-T02: declaration grammar and nested-repository implication match native 317', () => {
  assert.equal(runnerDeclarationArgument([NESTED, ABSENT]),
    '--runner-declares=diff-finds-nested-repository,no-repository-checked-out')
  assert.deepEqual(parseRunnerDeclaration('--runner-declares=' + NESTED), {
    nestedRepository: true, noRepositoryCheckedOut: false,
  })
  assert.deepEqual(parseRunnerDeclaration('--runner-declares=' + ABSENT), {
    nestedRepository: false, noRepositoryCheckedOut: false,
  })
  assert.deepEqual(parseRunnerDeclaration('--runner-declares=' + NESTED + ',' + ABSENT), {
    nestedRepository: true, noRepositoryCheckedOut: true,
  })
  assert.equal(parseRunnerDeclaration('--other=' + NESTED), null)
  assert.deepEqual(parseRunnerDeclaration('--runner-declares='), {
    nestedRepository: false, noRepositoryCheckedOut: false,
  })
})
test('M1 C19-T02: runner capabilities are adopted only after matching declaration', () => {
  const events = []
  const state = {
    setRunnerDeclaredNestedRepositoryDiff: value => events.push(['nested', value]),
    setRunnerDeclaredNoRepositoryCheckedOut: value => events.push(['noCheckout', value]),
  }
  adoptRunnerDeclaration('--runner-declares=' + ABSENT, state)
  adoptRunnerDeclaration('--runner-declares=unknown', state)
  assert.deepEqual(events, [])
  adoptRunnerDeclaration('--runner-declares=' + NESTED, state)
  assert.deepEqual(events, [['nested', true]])
  adoptRunnerDeclaration('--runner-declares=' + NESTED + ',' + ABSENT, state)
  assert.deepEqual(events, [['nested', true], ['nested', true], ['noCheckout', true]])
})
test('M1 C19-T02: production startup sends all declarations through shared parser', () => {
  const startup = readFileSync(join(root, 'src/entrypoints/cli.tsx'), 'utf8')
  assert.match(startup, /if \(runnerArg !== undefined\) \{[\s\S]*?adoptRunnerDeclaration\(runnerArg, state\)/)
  assert.doesNotMatch(startup, /runnerArg\?\.includes\('diff-finds-nested-repository'\)/)
})
test('M1 C19-T02: real bootstrap state latches both runner declarations', () => {
  const script = [
    'import assert from "node:assert/strict";',
    'import {getRunnerDeclaredNestedRepositoryDiff as nested, getRunnerDeclaredNoRepositoryCheckedOut as absent, setRunnerDeclaredNestedRepositoryDiff as setNested, setRunnerDeclaredNoRepositoryCheckedOut as setAbsent} from "./src/bootstrap/state.ts";',
    'import {adoptRunnerDeclaration} from "./src/entrypoints/runnerDeclaration317.mjs";',
    'assert.equal(nested(),false); assert.equal(absent(),false);',
    'adoptRunnerDeclaration("--runner-declares=no-repository-checked-out",{setRunnerDeclaredNestedRepositoryDiff:setNested,setRunnerDeclaredNoRepositoryCheckedOut:setAbsent});',
    'assert.equal(nested(),false); assert.equal(absent(),false);',
    'adoptRunnerDeclaration("--runner-declares=diff-finds-nested-repository,no-repository-checked-out",{setRunnerDeclaredNestedRepositoryDiff:setNested,setRunnerDeclaredNoRepositoryCheckedOut:setAbsent});',
    'assert.equal(nested(),true); assert.equal(absent(),true);',
    'assert.throws(()=>setNested(false),/one-way/); assert.throws(()=>setAbsent(false),/one-way/);',
  ].join('\n')
  const result = spawnSync('bun', ['-e', script], {
    cwd: root, encoding: 'utf8', timeout: 20_000,
  })
  assert.equal(result.error, undefined, String(result.error))
  assert.equal(result.status, 0, result.stderr)
})
test('M1 C19-T02: official and reconstructed CLIs consume runner declaration before version/help routing', () => {
  const candidates = [
    ['rebuilt', 'bun', [join(root, 'dist/cli.js')]],
    ['standalone', join(root, 'dist', process.platform === 'win32' ? 'avenlo.exe' : 'avenlo'), []],
  ]
  if (process.env.CLAUDE_REFERENCE_BIN)
    candidates.unshift(['official 317', process.env.CLAUDE_REFERENCE_BIN, []])
  for (const [label, executable, prefix] of candidates) {
    for (const flags of [
      [NESTED], [ABSENT], [NESTED, ABSENT], ['unknown'],
    ]) {
      for (const action of ['--version', '--help']) {
        const r = spawnSync(executable,
          [...prefix, runnerDeclarationArgument(flags), action], {
            cwd: root, encoding: 'utf8', timeout: 15_000,
            env: { ...process.env, DISABLE_TELEMETRY: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' },
          })
        assert.equal(r.error, undefined, label + ' ' + r.error)
        assert.equal(r.status, 0, label + ': ' + r.stderr)
        if (action === '--version') assert.equal(r.stdout.trim(), `2.1.317 (${label.startsWith('official') ? 'Claude Code' : 'Avenlo'})`, label)
        else assert.match(r.stdout, label.startsWith('official') ? /Usage: claude/ : /Usage: avenlo/, label)
      }
    }
  }
})
