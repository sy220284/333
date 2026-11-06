import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, statSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

const privateHome = mkdtempSync(join(tmpdir(), '333-local-feature-test-'))
const originalHome = process.env.HOME
const originalUserProfile = process.env.USERPROFILE
process.env.HOME = privateHome
process.env.USERPROFILE = privateHome

after(() => {
  if (originalHome === undefined) delete process.env.HOME
  else process.env.HOME = originalHome
  if (originalUserProfile === undefined) delete process.env.USERPROFILE
  else process.env.USERPROFILE = originalUserProfile
  rmSync(privateHome, { recursive: true, force: true })
})

const { saveLocalFeedback, listLocalFeedback } = await import('../src/services/localRuntime/feedbackReports.ts')
const { updateIndependentProfile, getIndependentProfile, mergeDiscoveredModelProfiles, readIndependentProfiles } =
  await import('../src/services/api/multimodel/profiles.ts')
const { discoverIndependentModelDetails } = await import('../src/services/api/multimodel/registry.ts')
const { countIndependentModelTokens } = await import('../src/services/api/multimodel/tokenCounting.ts')
const { readSavedModelCatalog } = await import('../src/services/api/multimodel/catalog.ts')
const { readIndependentPricing } = await import('../src/services/api/multimodel/pricing.ts')
const { resolveIndependentModel } = await import('../src/services/api/multimodel/registry.ts')

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

test('Chat-completions provider token estimates work without external requests', async () => {
  const result = await countIndependentModelTokens('deepseek/deepseek-chat', [
    { role: 'user', content: 'Local estimate' },
  ], [])
  assert.equal(result.kind, 'local-estimate')
  assert.ok(result.tokens > 0)
})

test('removed providers and gateway variants are rejected before any remote request', async () => {
  const removed = [
    'gemini/gemini-3.8-flash',
    'xai/grok-4',
    'openrouter/google/gemini-3.8-flash',
    'openrouter/x-ai/grok-4',
  ]
  for (const model of removed) {
    assert.equal(resolveIndependentModel(model), null, model)
    await assert.rejects(
      countIndependentModelTokens(model, [{ role: 'user', content: 'hello' }], []),
      /Expected supported qualified remote model ID/,
    )
  }
  assert.equal(resolveIndependentModel('openrouter/google/gemma-3')?.provider, 'openrouter')
  assert.equal(resolveIndependentModel('openrouter/anthropic/claude-opus-5-5')?.provider, 'openrouter')
})

test('gateway model discovery keeps other model families while filtering Gemini and Grok', async () => {
  const fake = (async () => new Response(JSON.stringify({ data: [
    { id: 'google/gemini-3.8-flash' },
    { id: 'x-ai/grok-4' },
    { id: 'google/gemma-3' },
    { id: 'anthropic/claude-opus-5-5' },
  ] }))) as typeof fetch
  const results = await discoverIndependentModelDetails('openrouter', 'test-token', fake)
  assert.deepEqual(results.map(x => x.id), ['google/gemma-3', 'anthropic/claude-opus-5-5'])
})

test('old local model, profile and price caches exclude removed providers without blocking valid entries', () => {
  const directory = join(privateHome, '.333', 'models')
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, 'catalog.json'), JSON.stringify({
    schema: 1, models: [
      { provider: 'gemini', id: 'gemini-test', discoveredAt: '2026-11-01' },
      { provider: 'xai', id: 'grok-4', discoveredAt: '2026-11-01' },
      { provider: 'openrouter', id: 'google/gemini-3.8-flash', discoveredAt: '2026-11-01' },
      { provider: 'deepseek', id: 'deepseek-chat', discoveredAt: '2026-11-01' },
    ],
  }))
  assert.deepEqual(readSavedModelCatalog().models.map(x => x.provider + '/' + x.id), [
    'deepseek/deepseek-chat',
  ])

  writeFileSync(join(directory, 'profiles.json'), JSON.stringify({
    'gemini/gemini-test': { source: 'provider' },
    'openrouter/x-ai/grok-4': { source: 'manual' },
    'deepseek/deepseek-chat': { source: 'manual', contextWindow: 100000 },
  }))
  assert.deepEqual(Object.keys(readIndependentProfiles()), ['deepseek/deepseek-chat'])

  writeFileSync(join(directory, 'pricing.json'), JSON.stringify({
    'xai/grok-4': { input: 1, output: 2 },
    'openrouter/google/gemini-3.8-flash': { input: 1, output: 2 },
    'deepseek/deepseek-chat': { input: 0.3, output: 1.5 },
  }))
  assert.deepEqual(Object.keys(readIndependentPricing()), ['deepseek/deepseek-chat'])
})
