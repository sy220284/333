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
const { getModelFieldProfile } = await import('../src/services/api/multimodel/providerFields.ts')
const { toChatCompletions } = await import('../src/services/api/multimodel/convert.ts')
const { countIndependentModelTokens } = await import('../src/services/api/multimodel/tokenCounting.ts')
const { readSavedModelCatalog } = await import('../src/services/api/multimodel/catalog.ts')
const { readIndependentPricing } = await import('../src/services/api/multimodel/pricing.ts')
const { getModelStorageRoot } = await import('../src/services/api/multimodel/storage.ts')
const { resolveIndependentModel } = await import('../src/services/api/multimodel/registry.ts')
const { validateApiKeyProvider, readProviderApiKey, listProviderApiKeyAccounts, setProviderApiKey } =
  await import('../src/services/auth/apiKeyVault.ts')

test('feedback is explicitly stored locally and never tries to contact a server', async () => {
  const oldFetch = globalThis.fetch
  globalThis.fetch = (() => { throw new Error('Unexpected network call') }) as typeof fetch
  try {
    const path = await saveLocalFeedback('A test-only local report')
    const stored = JSON.parse(readFileSync(path, 'utf8'))
    assert.equal(stored.description, 'A test-only local report')
    assert.equal(stored.source, 'yaoyaoche-local')
    assert.equal((await listLocalFeedback())[0]?.id, stored.id)
    if (process.platform !== 'win32') {
      assert.equal(statSync(path).mode & 0o077, 0)
    }
    await assert.rejects(saveLocalFeedback('   '), /反馈内容为空/)
  } finally { globalThis.fetch = oldFetch }
})

test('provider metadata stores actual context/output limits and respects explicit overrides', async () => {
  const model = 'deepseek/deepseek-chat'
  const discovered = await mergeDiscoveredModelProfiles('deepseek', [
    { id: 'deepseek-chat', contextWindow: 100000, maxOutputTokens: 8192, supportsTools: true },
  ])
  assert.equal(discovered, 1)
  assert.equal(getIndependentProfile(model)?.contextWindow, 100000)
  assert.equal(getIndependentProfile(model)?.supportsTools, true)
  await updateIndependentProfile(model, {
    source: 'manual', contextWindow: 160000, maxOutputTokens: 12000,
  })
  const overwritten = await mergeDiscoveredModelProfiles('deepseek', [
    { id: 'deepseek-chat', contextWindow: 32000, maxOutputTokens: 4096 },
  ])
  assert.equal(overwritten, 0)
  assert.equal(getIndependentProfile(model)?.contextWindow, 160000)
})

test('Qwen direct model discovery collects context, output and advertised capabilities', async () => {
  const fake = (async () => new Response(JSON.stringify({ data: [
    { id: 'qwen3.8-max', context_window: 120000, max_output_tokens: 30000,
      input_modalities: ['text', 'image'], supported_parameters: ['tools'] },
  ] }), { status: 200 })) as typeof fetch
  const models = await discoverIndependentModelDetails('qwen', 'test', fake)
  assert.deepEqual(models, [{
    id: 'qwen3.8-max', contextWindow: 120000, maxOutputTokens: 30000,
    supportsTools: true, supportsVision: true,
  }])
})

test('Chat-completions provider token estimates work without external requests', async () => {
  const result = await countIndependentModelTokens('deepseek/deepseek-chat', [
    { role: 'user', content: 'Local estimate' },
  ], [])
  assert.equal(result.kind, 'local-estimate')
  assert.ok(result.tokens > 0)
})

test('retired Gemini, Grok and OpenRouter model IDs are refused before any API request', async () => {
  const removed = [
    'gemini/gemini-3.8-flash',
    'xai/grok-4',
    'openrouter/deepseek/deepseek-chat',
    'openrouter/google/gemini-3.8-flash',
    'openrouter/x-ai/grok-4',
    'openrouter/google/gemma-3',
    'openrouter/anthropic/claude-opus-5-5',
  ]
  for (const model of removed) {
    assert.equal(resolveIndependentModel(model), null, model)
    await assert.rejects(
      countIndependentModelTokens(model, [{ role: 'user', content: 'hello' }], []),
      /Expected supported qualified remote model ID/,
    )
  }
  assert.equal(resolveIndependentModel('deepseek/deepseek-chat')?.provider, 'deepseek')
  assert.equal(resolveIndependentModel('qwen/qwen3.8-max')?.provider, 'qwen')
})

test('retired OpenRouter API keys cannot be used, listed or re-saved', async () => {
  const directory = join(privateHome, '.yaoyaoche', 'auth')
  mkdirSync(directory, { recursive: true })
  const vault = join(directory, 'provider-api-keys.json')
  writeFileSync(vault, JSON.stringify({
    schema: 1, keys: { openrouter: 'old-secret-unused', deepseek: 'active-key-123' },
  }))
  assert.throws(() => validateApiKeyProvider('openrouter'), /服务商未识别/)
  assert.throws(() => readProviderApiKey('openrouter' as never), /服务商未识别/)
  assert.deepEqual(listProviderApiKeyAccounts(), ['deepseek'])
  assert.equal(readProviderApiKey('deepseek'), 'active-key-123')
  await setProviderApiKey('qwen', 'qwen-valid-key')
  const persisted = JSON.parse(readFileSync(vault, 'utf8'))
  assert.equal(Object.hasOwn(persisted.keys, 'openrouter'), false)
  assert.equal(persisted.keys.deepseek, 'active-key-123')
  assert.equal(persisted.keys.qwen, 'qwen-valid-key')
})

test('old local model, profile and price caches exclude removed providers without blocking valid entries', () => {
  assert.equal(getModelStorageRoot(), join(privateHome, '.yaoyaoche', 'models'))
  const directory = getModelStorageRoot()
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, 'catalog.json'), JSON.stringify({
    schema: 1, models: [
      { provider: 'gemini', id: 'gemini-test', discoveredAt: '2026-11-01' },
      { provider: 'xai', id: 'grok-4', discoveredAt: '2026-11-01' },
      { provider: 'openrouter', id: 'google/gemini-3.8-flash', discoveredAt: '2026-11-01' },
      { provider: 'openrouter', id: 'some-other-model', discoveredAt: '2026-11-01' },
      { provider: 'deepseek', id: 'deepseek-chat', discoveredAt: '2026-11-01' },
    ],
  }))
  assert.deepEqual(readSavedModelCatalog().models.map(x => `${x.provider}/${x.id}`), [
    'deepseek/deepseek-chat',
  ])

  writeFileSync(join(directory, 'profiles.json'), JSON.stringify({
    'gemini/gemini-test': { source: 'provider' },
    'openrouter/x-ai/grok-4': { source: 'manual' },
    'openrouter/vendor/ordinary': { source: 'manual' },
    'deepseek/deepseek-chat': { source: 'manual', contextWindow: 100000 },
  }))
  assert.deepEqual(Object.keys(readIndependentProfiles()), ['deepseek/deepseek-chat'])

  writeFileSync(join(directory, 'pricing.json'), JSON.stringify({
    'xai/grok-4': { input: 1, output: 2 },
    'openrouter/google/gemini-3.8-flash': { input: 1, output: 2 },
    'openrouter/vendor/ordinary': { input: 1, output: 2 },
    'deepseek/deepseek-chat': { input: 0.3, output: 1.5 },
  }))
  assert.deepEqual(Object.keys(readIndependentPricing()), ['deepseek/deepseek-chat'])
})


test('official DeepSeek discovery persists model-specific effort limits and default', async () => {
  const backend = (async () => Response.json({ data: [{
    id: 'deepseek-v4-pro',
    context_window: 1048576, max_output_tokens: 131072,
    input_modalities: ['text', 'image'],
    effort: { supported_levels: ['high', 'max'], default_level: 'max' },
  }] })) as typeof fetch
  const found = await discoverIndependentModelDetails('deepseek', 'mock-key', backend)
  assert.deepEqual(found, [{
    id: 'deepseek-v4-pro', contextWindow: 1048576, maxOutputTokens: 131072,
    supportsVision: true, supportedEffort: ['high', 'max'], defaultEffort: 'max',
  }])
  assert.equal(await mergeDiscoveredModelProfiles('deepseek', found), 1)
  const saved = getIndependentProfile('deepseek/deepseek-v4-pro')
  assert.equal(saved?.defaultEffort, 'max')
  assert.deepEqual(getModelFieldProfile('deepseek', 'deepseek-v4-pro').supportedEffort,
    ['high', 'max'])
  assert.throws(() => toChatCompletions({
    model: 'deepseek/deepseek-v4-pro', messages: [{ role: 'user', content: 'hello' }],
    max_tokens: 2000, output_config: { effort: 'low' },
  }, 'deepseek-v4-pro', 'deepseek'), /可用档位：high, max/)
  await assert.rejects(updateIndependentProfile('deepseek/deepseek-v4-pro', {
    source: 'manual', supportedEffort: ['low'], defaultEffort: 'max',
  }), /default effort/)
})
