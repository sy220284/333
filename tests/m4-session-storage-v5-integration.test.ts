import { test, expect } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('Storage V5 persists queue operations to owning session across resume and preserves parked writes', { timeout: 45_000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), '333-storage-v5-'))
  const oldConfig = process.env.CLAUDE_CONFIG_DIR
  const oldPersistence = process.env.TEST_ENABLE_SESSION_PERSISTENCE
  process.env.CLAUDE_CONFIG_DIR = join(root, 'config')
  process.env.TEST_ENABLE_SESSION_PERSISTENCE = '1'
  const { switchSession, getSessionId } = await import('../src/bootstrap/state.js')
  const { asSessionId } = await import('../src/types/ids.js')
  const {
    setSessionFileForTesting, recordQueueOperation, resetSessionFilePointer,
    flushSessionStorage, resetProjectForTesting,
  } = await import('../src/utils/sessionStorage.js')
  const original = getSessionId()
  const first = asSessionId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  const second = asSessionId('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
  const third = asSessionId('cccccccc-cccc-4ccc-8ccc-cccccccccccc')
  const paths = {
    first: join(root, 'first.jsonl'),
    second: join(root, 'second.jsonl'),
    third: join(root, 'third.jsonl'),
  }
  const op = (sessionId: string, content: string) => ({
    type: 'queue-operation' as const,
    operation: 'enqueue' as const,
    timestamp: new Date().toISOString(),
    sessionId, content,
  })
  try {
    switchSession(first)
    await resetSessionFilePointer()
    setSessionFileForTesting(paths.first)
    await recordQueueOperation(op(first, 'ORIGINAL_SESSION_QUEUE'))
    await flushSessionStorage()

    switchSession(second)
    await resetSessionFilePointer()
    setSessionFileForTesting(paths.second)
    // This operation was accepted by the old session before the switch but
    // settled after it. It must never appear in the second transcript.
    await recordQueueOperation(op(first, 'LATE_FIRST_SESSION_QUEUE'))
    await recordQueueOperation(op(second, 'SECOND_SESSION_QUEUE'))
    await flushSessionStorage()
    expect(readFileSync(paths.first, 'utf8')).toContain('LATE_FIRST_SESSION_QUEUE')
    expect(readFileSync(paths.first, 'utf8')).not.toContain('SECOND_SESSION_QUEUE')
    expect(readFileSync(paths.second, 'utf8')).toContain('SECOND_SESSION_QUEUE')
    expect(readFileSync(paths.second, 'utf8')).not.toContain('LATE_FIRST_SESSION_QUEUE')

    switchSession(third)
    await resetSessionFilePointer()
    await recordQueueOperation(op(third, 'PARKED_THIRD_SESSION_QUEUE'))
    await flushSessionStorage()
    expect(existsSync(paths.third)).toBe(false)

    switchSession(second)
    await resetSessionFilePointer()
    setSessionFileForTesting(paths.second)
    await recordQueueOperation(op(second, 'SECOND_SESSION_AFTER_SWITCH'))
    await flushSessionStorage()

    switchSession(third)
    await resetSessionFilePointer()
    setSessionFileForTesting(paths.third)
    await flushSessionStorage()
    const parked = readFileSync(paths.third, 'utf8')
    expect(parked).toContain('PARKED_THIRD_SESSION_QUEUE')
    expect(parked).not.toContain('SECOND_SESSION_AFTER_SWITCH')
  } finally {
    await flushSessionStorage()
    switchSession(original)
    await resetSessionFilePointer()
    resetProjectForTesting()
    rmSync(root, { recursive: true, force: true })
    if (oldConfig === undefined) delete process.env.CLAUDE_CONFIG_DIR
    else process.env.CLAUDE_CONFIG_DIR = oldConfig
    if (oldPersistence === undefined) delete process.env.TEST_ENABLE_SESSION_PERSISTENCE
    else process.env.TEST_ENABLE_SESSION_PERSISTENCE = oldPersistence
  }
})

test('late transcript writes keep their original session and path after /resume', { timeout: 45_000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), '333-storage-v5-transcript-'))
  const oldConfig = process.env.CLAUDE_CONFIG_DIR
  const oldPersistence = process.env.TEST_ENABLE_SESSION_PERSISTENCE
  process.env.CLAUDE_CONFIG_DIR = join(root, 'config')
  process.env.TEST_ENABLE_SESSION_PERSISTENCE = '1'
  const { switchSession, getSessionId } = await import('../src/bootstrap/state.js')
  const { asSessionId } = await import('../src/types/ids.js')
  const { createUserMessage } = await import('../src/utils/messages.js')
  const {
    recordTranscript, resetSessionFilePointer, setSessionFileForTesting,
    getTranscriptPath, getTranscriptPathForSession,
    flushSessionStorage, resetProjectForTesting,
  } = await import('../src/utils/sessionStorage.js')
  const original = getSessionId()
  const first = asSessionId('dddddddd-dddd-4ddd-8ddd-dddddddddddd')
  const second = asSessionId('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')
  const firstFile = join(root, 'first.jsonl')
  const secondFile = join(root, 'second.jsonl')
  try {
    switchSession(first)
    await resetSessionFilePointer()
    setSessionFileForTesting(firstFile)
    expect(getTranscriptPath()).toBe(firstFile)
    expect(getTranscriptPathForSession(first)).toBe(firstFile)

    // recordTranscript yields while deduplicating UUIDs. The session switch
    // must not change its destination or the sessionId stamped in the JSONL.
    const pending = recordTranscript([
      createUserMessage({ content: 'FIRST_SESSION_ASYNC_TRANSCRIPT_V5' }),
    ])
    switchSession(second)
    await resetSessionFilePointer()
    setSessionFileForTesting(secondFile)
    expect(getTranscriptPathForSession(first)).toBe(firstFile)
    expect(getTranscriptPathForSession(second)).toBe(secondFile)
    await pending
    await flushSessionStorage()
    expect(existsSync(firstFile)).toBe(true)
    const firstText = readFileSync(firstFile, 'utf8')
    expect(firstText).toContain('FIRST_SESSION_ASYNC_TRANSCRIPT_V5')
    expect(firstText).toContain(first)
    expect(existsSync(secondFile)).toBe(false)

    // The original transcript now exists; an additional delayed write must
    // append to its old path without contaminating the active session.
    switchSession(first)
    await resetSessionFilePointer()
    setSessionFileForTesting(firstFile)
    const nextPending = recordTranscript([
      createUserMessage({ content: 'SECOND_LATE_WRITE_FOR_FIRST_V5' }),
    ])
    switchSession(second)
    await resetSessionFilePointer()
    setSessionFileForTesting(secondFile)
    await nextPending
    await flushSessionStorage()
    const resumedText = readFileSync(firstFile, 'utf8')
    expect(resumedText).toContain('SECOND_LATE_WRITE_FOR_FIRST_V5')
    expect(resumedText).toContain(first)
    expect(existsSync(secondFile)).toBe(false)
  } finally {
    await flushSessionStorage()
    switchSession(original)
    await resetSessionFilePointer()
    resetProjectForTesting()
    rmSync(root, { recursive: true, force: true })
    if (oldConfig === undefined) delete process.env.CLAUDE_CONFIG_DIR
    else process.env.CLAUDE_CONFIG_DIR = oldConfig
    if (oldPersistence === undefined) delete process.env.TEST_ENABLE_SESSION_PERSISTENCE
    else process.env.TEST_ENABLE_SESSION_PERSISTENCE = oldPersistence
  }
})

test('explicit resumed worktree path overrides the prior location for the same session', async () => {
  const { switchSession, getSessionId } = await import('../src/bootstrap/state.js')
  const { asSessionId } = await import('../src/types/ids.js')
  const { getTranscriptPath, getTranscriptPathForSession } =
    await import('../src/utils/sessionStorage.js')
  const original = getSessionId()
  const session = asSessionId('ffffffff-ffff-4fff-8fff-ffffffffffff')
  const firstDir = join(tmpdir(), 'cc-v5-worktree-one')
  const secondDir = join(tmpdir(), 'cc-v5-worktree-two')
  try {
    switchSession(session, firstDir)
    expect(getTranscriptPathForSession(session)).toBe(join(firstDir, session + '.jsonl'))
    switchSession(session, secondDir)
    expect(getTranscriptPath()).toBe(join(secondDir, session + '.jsonl'))
    expect(getTranscriptPathForSession(session)).toBe(join(secondDir, session + '.jsonl'))
  } finally {
    switchSession(original)
  }
})
