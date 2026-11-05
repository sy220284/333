import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, statSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

const privateHome = mkdtempSync(join(tmpdir(), '333-local-feature-test-'))
const originalHome = process.env.HOME
const originalUserProfile = process.env.USERPROFILE
const originalGeminiKey = process.env.GEMINI_API_KEY
process.env.HOME = privateHome
process.env.USERPROFILE = privateHome
process.env.GEMINI_API_KEY = 'test-gemini-key'

after(() => {
  if (originalHome === undefined) delete process.env.HOME
  else process.env.HOME = originalHome
  if (originalUserProfile === undefined) delete process.env.USERPROFILE
  else process.env.USERPROFILE = originalUserProfile
  if (originalGeminiKey === undefined) delete process.env.GEMINI_API_KEY
  else process.env.GEMINI_API_KEY = originalGeminiKey
  rmSync(privateHome, { recursive: true, force: true })
})

const { saveLocalFeedback, listLocalFeedback } = await import('../src/services/localRuntime/feedbackReports.ts')
const { updateIndependentProfile, getIndependentProfile, mergeDiscoveredModelProfiles } =
  await import('../src/services/api/multimodel/profiles.ts')
const { discoverIndependentModelDetails } = await import('../src/services/api/multimodel/registry.ts')
const { countIndependentModelTokens } = await import('../src/services/api/multimodel/tokenCounting.ts')

test('feedback is explicitly stored locally and never tries to contact a server', async () => {
  const oldFetch = globalThis.fetch
  globalThis.fetch = (() => { throw new Error('Unexpected network call') }) as typeof fetch
  try {
    const path = await saveLocalFeedback('A test-only local report')
    const stored = JSON.parse(readFileSync(path, 'utf8'))
    assert.equal(stored.description, 'A test-only local report')
    assert.equal(stored.source, '333-local')
    assert.equal((await listLocalFeedback())[0]?.id, stored.id)
    if (process.platform !== 'win32') {
      assert.equal(statSync(path).mode & 0o077, 0)
    }
    await assert.rejects(saveLocalFeedback('   '), /反馈内容为空/)
  } finally { globalThis.fetch = oldFetch }
})

test('provider metadata stores actual context/output limits and respects explicit overrides', async () => {
  const model = 'openrouter/vendor/model-with-slash'
  const discovered = await mergeDiscoveredModelProfiles('openrouter', [
    { id: 'vendor/model-with-slash', contextWindow: 100000, maxOutputTokens: 8192, supportsTools: true },
  ])
  assert.equal(discovered, 1)
  assert.equal(getIndependentProfile(model)?.contextWindow, 100000)
  assert.equal(getIndependentProfile(model)?.supportsTools, true)
  await updateIndependentProfile(model, {
    source: 'manual', contextWindow: 160000, maxOutputTokens: 12000,
  })
  const overwritten = await mergeDiscoveredModelProfiles('openrouter', [
    { id: 'vendor/model-with-slash', contextWindow: 32000, maxOutputTokens: 4096 },
  ])
  assert.equal(overwritten, 0)
  assert.equal(getIndependentProfile(model)?.contextWindow, 160000)
})

test('provider discovery retains OpenRouter compound IDs and collects advertised capabilities', async () => {
  const fake = (async () => new Response(JSON.stringify({ data: [
    { id: 'company/model-name', context_length: 120000, top_provider: { max_completion_tokens: 30000 },
      architecture: { input_modalities: ['text', 'image'] } },
  ] }), { status: 200 })) as typeof fetch
  const models = await discoverIndependentModelDetails('openrouter', 'test', fake)
  assert.deepEqual(models, [{
    id: 'company/model-name', contextWindow: 120000, maxOutputTokens: 30000, supportsVision: true,
  }])
})

test('Gemini countTokens uses the provider endpoint and native count semantics', async () => {
  let inspected = false
  const fake = (async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.match(String(input), /models\/gemini-test:countTokens\?key=test-gemini-key/)
    const body = JSON.parse(String(init?.body))
    assert.equal(body.generateContentRequest.contents[0].parts[0].text, 'Hello')
    inspected = true
    return new Response(JSON.stringify({ totalTokens: 19 }))
  }) as typeof fetch
  const result = await countIndependentModelTokens('gemini/gemini-test', [
    { role: 'user', content: 'Hello' },
  ], [], fake)
  assert.deepEqual(result, { tokens: 19, kind: 'remote-exact' })
  assert.equal(inspected, true)
})

test('Chat-completions provider token estimates work without external requests', async () => {
  const fake = (async () => { throw new Error('Network call was not expected') }) as typeof fetch
  const result = await countIndependentModelTokens('deepseek/deepseek-chat', [
    { role: 'user', content: 'Local estimate' },
  ], [], fake)
  assert.equal(result.kind, 'local-estimate')
  assert.ok(result.tokens > 0)
})
