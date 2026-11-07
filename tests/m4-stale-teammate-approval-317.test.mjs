import test from 'node:test'
import assert from 'node:assert/strict'
import { isStaleShutdownApproval } from '../src/utils/swarm/shutdownEpoch.ts'
import { readFileSync } from 'node:fs'

test('2.1.317 late shutdown approvals cannot remove a re-created teammate', () => {
  const oldApproval='2026-11-07T10:00:00.000Z'
  const memberJoined=Date.parse('2026-11-07T10:00:01.000Z')
  assert.equal(isStaleShutdownApproval(memberJoined,oldApproval),true)
  assert.equal(isStaleShutdownApproval(memberJoined,'2026-11-07T10:00:01.000Z'),true)
  assert.equal(isStaleShutdownApproval(memberJoined,'not-a-time'),true)
  assert.equal(isStaleShutdownApproval(memberJoined,'2026-11-07T10:00:02.000Z'),false)
})

test('the leader checks join identity before pane termination, task unassignment and state removal', () => {
  const poller=readFileSync(new URL('../src/hooks/useInboxPoller.ts',import.meta.url),'utf8')
  const block=poller.slice(poller.indexOf('// Handle shutdown approvals (leader side)'),
    poller.indexOf('// Process regular teammate messages (existing logic)'))
  assert.match(block,/isStaleShutdownApproval\(/)
  assert.match(block,/readTeamFileAsync\(/)
  assert.match(block,/onlyIfJoinedBefore:\s*approvalSentAt/)
  assert.match(block,/parsed\.paneId === currentMember\.tmuxPaneId/)
  assert.ok(block.indexOf('isStaleShutdownApproval(')<block.indexOf('killPane('))
  assert.ok(block.indexOf('removeTeammateFromTeamFile(')<block.indexOf('killPane('))
})

test('all team mailbox writes and team deletes use a stable shared lifecycle guard', () => {
  const mailbox=readFileSync(new URL('../src/utils/teammateMailbox.ts',import.meta.url),'utf8')
  const helper=readFileSync(new URL('../src/utils/swarm/teamHelpers.ts',import.meta.url),'utf8')
  const lock=readFileSync(new URL('../src/utils/swarm/teamLifecycleLock.ts',import.meta.url),'utf8')
  assert.match(mailbox,/return withTeamLifecycleLock\(resolvedTeam, async \(\) =>/)
  assert.match(mailbox,/await readFile\(getTeamFilePath\(resolvedTeam\)/)
  assert.match(helper,/return withTeamLifecycleLock\(teamName, async \(\) =>/)
  assert.match(lock,/join\(getTeamsDir\(\), '\.team-lifecycle'\)/)
})
