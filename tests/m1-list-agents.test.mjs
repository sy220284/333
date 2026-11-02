import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { listReachableTeammates } from '../src/tools/ListAgentsTool/peerListing.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const source = path => readFileSync(resolve(root, path), 'utf8')

test('only registered team mailbox recipients are listed', () => {
  const peers = listReachableTeammates({
    members: [
      { name: 'team-lead' }, { name: 'researcher' }, { name: 'Writer' },
      { name: 'writer' }, { name: '' }, { name: 'x@bad' },
    ],
  }, 'team-lead')
  assert.deepEqual(peers, [
    { name: 'researcher', to: 'researcher', channel: 'team' },
    { name: 'Writer', to: 'Writer', channel: 'team' },
  ])
})
test('current teammate is excluded case-insensitively', () => {
  assert.deepEqual(listReachableTeammates({members:[{name:'Team-Lead'},{name:'researcher'}]}, 'researcher'), [
    { name: 'Team-Lead', to: 'Team-Lead', channel: 'team' },
  ])
})
test('no active team means no discovered recipient, not a fabricated peer', () => {
  assert.deepEqual(listReachableTeammates(null, 'current-session'), [])
  assert.deepEqual(listReachableTeammates({members:[]}, 'team-lead'), [])
})
test('model-visible tool uses official name and input contract and is wired to runtime pool', () => {
  const module = source('src/tools/ListAgentsTool/ListAgentsTool.ts')
  const pool = source('src/tools.ts')
  assert.match(module, /name: 'ListAgents'/)
  assert.match(module, /channel: z\.string\(\)\.optional\(\)/)
  assert.match(module, /q: z\.string\(\)\.optional\(\)/)
  assert.match(module, /readTeamFileAsync\(teamName\)/)
  assert.match(module, /getSessionId\(\)/)
  assert.match(pool, /\bListAgentsTool,\s*\n/)
  assert.match(pool, /import \{ ListAgentsTool \}/)
})
