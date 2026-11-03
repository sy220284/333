import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { withWebToolDeadline } from '../src/utils/webToolDeadline.mjs'

test('completed operation is returned without aborting parent', async () => {
  const parent = new AbortController()
  assert.equal(await withWebToolDeadline(parent, async child => {
    assert.equal(child.signal.aborted, false)
    return 'done'
  }, 50), 'done')
  assert.equal(parent.signal.aborted, false)
})

test('stalled search fails on deadline and cancels only its own work', async () => {
  const parent = new AbortController()
  let child
  await assert.rejects(withWebToolDeadline(parent, async c => {
    child = c
    return new Promise(() => {})
  }, 10), /300 seconds/)
  assert.equal(child.signal.aborted, true)
  assert.equal(parent.signal.aborted, false)
})

test('explicit user cancellation propagates immediately', async () => {
  const parent = new AbortController()
  const reason = new Error('user cancelled')
  const started = withWebToolDeadline(parent, () => new Promise(() => {}), 600)
  parent.abort(reason)
  await assert.rejects(started, error => error === reason)
})

test('WebFetch and WebSearch both use the bounded controller for all phases', () => {
  const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
  const fetch = read('src/tools/WebFetchTool/WebFetchTool.ts')
  const search = read('src/tools/WebSearchTool/WebSearchTool.ts')
  assert.match(fetch, /withWebToolDeadline\(abortController, async requestController/)
  assert.match(fetch, /getURLMarkdownContent\(url, requestController\)/)
  assert.match(fetch, /requestController\.signal,/)
  assert.match(search, /withWebToolDeadline\(context\.abortController, async requestController/)
  assert.match(search, /signal: requestController\.signal,/)
})
