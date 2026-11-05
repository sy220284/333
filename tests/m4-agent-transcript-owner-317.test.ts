import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { getSessionId, getSessionProjectDir, switchSession } from '../src/bootstrap/state.ts'
import { asAgentId, asSessionId } from '../src/types/ids.ts'
import { captureAgentTranscriptOwner317, flushSessionStorage, getAgentTranscriptPath, recordSidechainTranscript, resetSessionFilePointer } from '../src/utils/sessionStorage.ts'
import { createUserMessage } from '../src/utils/messages.ts'

test('late sidechain writes retain the source session after the active project changes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agent-transcript-owner-'))
  const oldId = getSessionId()
  const oldDir = getSessionProjectDir()
  const persistence = process.env.TEST_ENABLE_SESSION_PERSISTENCE
  const source = asSessionId(randomUUID())
  const agent = asAgentId('a1234567890123456')
  process.env.TEST_ENABLE_SESSION_PERSISTENCE = '1'
  try {
    switchSession(source, join(root, 'source'))
    await resetSessionFilePointer()
    captureAgentTranscriptOwner317(agent)
    const path = getAgentTranscriptPath(agent)
    switchSession(asSessionId(randomUUID()), join(root, 'destination'))
    await recordSidechainTranscript([createUserMessage({ content: 'late source message' })], agent)
    await flushSessionStorage()
    const entry = JSON.parse((await readFile(path, 'utf8')).trim())
    assert.equal(entry.sessionId, source)
    assert.match(JSON.stringify(entry.message), /late source message/)
    assert.equal(getAgentTranscriptPath(agent), path)
    assert.equal(dirname(dirname(dirname(path))), join(root, 'source'))
  } finally {
    switchSession(oldId, oldDir)
    await resetSessionFilePointer()
    if (persistence === undefined) delete process.env.TEST_ENABLE_SESSION_PERSISTENCE
    else process.env.TEST_ENABLE_SESSION_PERSISTENCE = persistence
    await rm(root, { recursive: true, force: true })
  }
})
