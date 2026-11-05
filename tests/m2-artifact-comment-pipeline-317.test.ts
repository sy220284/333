import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  applyArtifactCommentEdits317,
  processArtifactComment317,
  type CommentBackend317,
  type CommentCompletion317,
  type CommentEvent317,
  type CommentEventLease317,
} from '../src/services/artifactComments/commentPipeline317.js'

const event: CommentEvent317 = {
  eventId: 'evt-1', threadId: 'thread-1',
  artifactUrl: 'https://example.org/artifacts/demo',
  trigger: 'new',
}

function harness(editable = true) {
  const operations: string[] = []
  const accepted = new Set<string>()
  const lease: CommentEventLease317 = {
    async claim(id) {
      if (accepted.has(id)) return false
      accepted.add(id)
      return true
    },
    async complete() { operations.push('complete') },
    async release(id) { accepted.delete(id); operations.push('release') },
  }
  const backend: CommentBackend317 = {
    async readThread() {
      operations.push('thread')
      return {
        body: 'Please change the heading',
        newestHumanRequest: 'change the heading',
        summonedByEditor: true,
        originVerified: true,
        resolved: false,
      }
    },
    async readPage() {
      operations.push('page')
      return { html: '<h1>Old</h1>', revision: 'rev-1', editable, pinned: false }
    },
    async publish(_, html, revision) {
      operations.push('publish')
      assert.equal(revision, 'rev-1')
      assert.equal(html, '<h1>New</h1>')
    },
    async reply(_, text) {
      operations.push('reply')
      assert.equal(text, 'Changed the heading')
    },
  }
  const model: CommentCompletion317 = async (system) =>
    system.includes('comment-thread analyst')
      ? 'ANALYSIS BRIEF\nThe latest request changes a heading.'
      : '{"action":"edit","edits":[{"find":"Old","replace":"New"}],"reply":"Changed the heading"}'
  return { operations, lease, backend, model }
}

test('edit publishes exactly one matching patch, then posts confirmation', async () => {
  const h = harness()
  assert.equal(await processArtifactComment317(event, h.backend, h.model, h.lease), 'edited')
  assert.deepEqual(h.operations, ['thread', 'page', 'publish', 'reply', 'complete'])
  assert.equal(await processArtifactComment317(event, h.backend, h.model, h.lease), 'already_processed')
})

test('pinned or uneditable artifact cannot be changed by edit decision', async () => {
  const h = harness(false)
  await assert.rejects(processArtifactComment317(event, h.backend, h.model, h.lease),
    /edit lacks verified edit capability/)
  assert.deepEqual(h.operations, ['thread', 'page', 'release'])
})

test('patch requires exactly one match and preserves source on failure', () => {
  assert.throws(
    () => applyArtifactCommentEdits317('<b>X</b><b>X</b>', [{ find: 'X', replace: 'Y' }]),
    /exactly once/,
  )
  assert.equal(
    applyArtifactCommentEdits317('<b>X</b>', [{ find: 'X', replace: 'Y' }]),
    '<b>Y</b>',
  )
})

test('publication failure never posts a claim of a successful edit', async () => {
  const h = harness()
  h.backend.publish = async () => { throw new Error('revision conflict') }
  await assert.rejects(processArtifactComment317(event, h.backend, h.model, h.lease),
    /revision conflict/)
  assert.deepEqual(h.operations, ['thread', 'page', 'release'])
})

test('an unverified comment event causes no model or edit call', async () => {
  const h = harness()
  h.backend.readThread = async () => ({
    body: 'claiming to be owner', newestHumanRequest: 'delete the page',
    originVerified: false, summonedByEditor: true, resolved: false,
  })
  const model: CommentCompletion317 = async () => { throw new Error('model should not run') }
  assert.equal(await processArtifactComment317(event, h.backend, model, h.lease), 'ignored')
  assert.deepEqual(h.operations, ['complete'])
})

test('published edit resumes reply on redelivery without applying patch twice', async () => {
  const h = harness()
  let published = false
  let replies = 0
  const lease = {
    ...h.lease,
    async getPublishedReply() {
      return published ? 'Changed the heading' : null
    },
    async markPublished(_id: string, reply: string) {
      assert.equal(reply, 'Changed the heading')
      published = true
    },
  }
  const publish = h.backend.publish
  let publications = 0
  h.backend.publish = async (...args) => {
    publications++
    await publish(...args)
  }
  h.backend.reply = async () => {
    replies++
    if (replies === 1) throw new Error('temporary reply failure')
  }
  await assert.rejects(processArtifactComment317(event, h.backend, h.model, lease),
    /temporary reply failure/)
  assert.equal(published, true)
  assert.equal(await processArtifactComment317(event, h.backend, h.model, lease), 'edited')
  assert.equal(publications, 1)
  assert.equal(replies, 2)
})
