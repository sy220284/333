import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readFile, readdir, rm, writeFile, copyFile, rename, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { withTranscriptDestinationLocks } from '../src/utils/transcriptDestinationLocks317.mjs'
import { replaceTranscriptBatchAtomically } from '../src/utils/atomicTranscriptRestore317.mjs'

function deferred() {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}

test('Concurrent CCR restores serialize overlapping targets and preserve the last complete result', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccr317-serial-'))
  try {
    const file = join(dir, 'main.jsonl')
    await writeFile(file, 'old\n')
    const entered = deferred(), release = deferred()
    let delayFirst = true
    const io = { writeFile, copyFile, unlink, rename: async (from, to) => {
      if (to === file && from.endsWith('.tmp') && delayFirst) {
        delayFirst = false
        entered.resolve()
        await release.promise
      }
      return rename(from, to)
    } }
    const first = replaceTranscriptBatchAtomically([{ path: file, content: 'first\n' }], io)
    await entered.promise
    const second = replaceTranscriptBatchAtomically([{ path: file, content: 'second\n' }])
    await new Promise(resolve => setImmediate(resolve))
    assert.equal((await readdir(dir)).filter(x => x.endsWith('.tmp')).length, 1)
    release.resolve()
    await Promise.all([first, second])
    assert.equal(await readFile(file, 'utf8'), 'second\n')
    assert.deepEqual(await readdir(dir), ['main.jsonl'])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('Opposite-order multi-file batches cannot deadlock or mix two sessions', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccr317-order-'))
  try {
    const a = join(dir, 'a.jsonl'), b = join(dir, 'b.jsonl')
    await Promise.all([
      replaceTranscriptBatchAtomically([{ path: b, content: 'first-b\n' }, { path: a, content: 'first-a\n' }]),
      replaceTranscriptBatchAtomically([{ path: a, content: 'second-a\n' }, { path: b, content: 'second-b\n' }]),
    ])
    assert.equal(await readFile(a, 'utf8'), 'second-a\n')
    assert.equal(await readFile(b, 'utf8'), 'second-b\n')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('Canonical path aliases to the same destination are rejected before writing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccr317-duplicate-'))
  try {
    await assert.rejects(replaceTranscriptBatchAtomically([
      { path: join(dir, 'main.jsonl'), content: 'a' },
      { path: join(dir, 'subdir', '..', 'main.jsonl'), content: 'b' },
    ]), /Duplicate transcript restoration destination/)
    assert.deepEqual(await readdir(dir), [])
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('An interrupted restore releases its lock and does not prevent subsequent success', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccr317-error-'))
  try {
    const file = join(dir, 'main.jsonl')
    await assert.rejects(replaceTranscriptBatchAtomically([{ path: file, content: 'bad' }], {
      writeFile: async () => { throw new Error('disk write failed') },
      copyFile, rename, unlink,
    }), /disk write failed/)
    await replaceTranscriptBatchAtomically([{ path: file, content: 'good\n' }])
    assert.equal(await readFile(file, 'utf8'), 'good\n')
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('Non-overlapping restores are allowed to run concurrently', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccr317-disjoint-'))
  try {
    const enteredA = deferred(), enteredB = deferred(), release = deferred()
    const a = withTranscriptDestinationLocks([join(dir, 'a')], async () => {
      enteredA.resolve(); await release.promise
    })
    const b = withTranscriptDestinationLocks([join(dir, 'b')], async () => {
      enteredB.resolve(); await release.promise
    })
    await Promise.all([enteredA.promise, enteredB.promise])
    release.resolve()
    await Promise.all([a, b])
  } finally { await rm(dir, { recursive: true, force: true }) }
})
