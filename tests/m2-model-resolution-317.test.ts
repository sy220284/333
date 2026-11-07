import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

function run(script: string, env: Record<string, string> = {}): void {
  const child = spawnSync('bun', ['-e', `import assert from 'node:assert/strict'; ${script}`], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 20_000,
    env: { ...process.env, NODE_ENV: 'test', ...env },
  })
  assert.equal(child.status, 0, child.stderr)
}

test('317 aliases select catalog provider defaults through the production model resolver', () => run(`
  import { parseUserSpecifiedModel } from './src/utils/model/model.ts';
  assert.equal(parseUserSpecifiedModel('opus'), 'claude-opus-5-5');
  assert.equal(parseUserSpecifiedModel('sonnet'), 'claude-sonnet-5-5');
  assert.equal(parseUserSpecifiedModel('haiku'), 'claude-haiku-5-5');
  assert.equal(parseUserSpecifiedModel('fable'), 'claude-fable-5-1');
  assert.equal(parseUserSpecifiedModel(' OPUS[1m] '), 'claude-opus-5-5');
  assert.equal(parseUserSpecifiedModel('sonnet[1m]'), 'claude-sonnet-5-5');
`))

test('317 third-party aliases use provider-specific catalog entries', () => run(`
  import { parseUserSpecifiedModel } from './src/utils/model/model.ts';
  assert.equal(parseUserSpecifiedModel('opus'), 'us.anthropic.claude-opus-5-5');
  assert.equal(parseUserSpecifiedModel('sonnet'), 'us.anthropic.claude-sonnet-5-5');
  assert.equal(parseUserSpecifiedModel('haiku'), 'us.anthropic.claude-haiku-5-5');
`, { CLAUDE_CODE_USE_BEDROCK: '1' }))

test('317 custom alias pins preserve case and explicit empty values', () => run(`
  import { parseUserSpecifiedModel } from './src/utils/model/model.ts';
  assert.equal(parseUserSpecifiedModel('opus'), 'MyDeployment');
  assert.equal(parseUserSpecifiedModel('sonnet'), '');
  assert.equal(parseUserSpecifiedModel(' CustomDeployment[1m][1m] '), 'CustomDeployment[1m]');
`, { ANTHROPIC_DEFAULT_OPUS_MODEL: 'MyDeployment', ANTHROPIC_DEFAULT_SONNET_MODEL: '' }))

test('317 canonical identities and public labels come from the same catalog', () => run(`
  import { firstPartyNameToCanonical, getPublicModelDisplayName } from './src/utils/model/model.ts';
  import { MODEL_CATALOG } from './src/utils/model/modelCatalog.ts';
  for (const entry of MODEL_CATALOG.models) {
    for (const id of Object.values(entry.provider_ids)) {
      if (typeof id !== 'string') continue;
      assert.equal(firstPartyNameToCanonical(id), entry.id, id);
      assert.equal(getPublicModelDisplayName(id), entry.display_name, id);
    }
  }
  assert.equal(firstPartyNameToCanonical('claude-opus-4-20250514'), 'claude-opus-4-0');
  assert.equal(firstPartyNameToCanonical('claude-sonnet-4-20250514'), 'claude-sonnet-4-0');
  assert.equal(firstPartyNameToCanonical('Custom-20261010'), 'custom');
  assert.equal(firstPartyNameToCanonical('claude-sonnet-4-0-preview'), 'claude-sonnet-4-0-preview');
  assert.equal(firstPartyNameToCanonical('custom:claude-opus-4-0'), 'custom:claude-opus-4-0');
  assert.equal(firstPartyNameToCanonical('us-gov.anthropic.claude-opus-6-v1:0'), 'claude-opus-6');
  assert.equal(getPublicModelDisplayName('Custom-20261010'), null);
  assert.equal(getPublicModelDisplayName('claude-opus-5-5[1m]'), 'Opus 5.5');
  assert.equal(getPublicModelDisplayName('claude-opus-4-6[1m]'), 'Opus 4.6 (1M context)');
`))

test('317 native 1M models ignore redundant context suffixes while old opt-in models retain them', () => run(`
  import { parseUserSpecifiedModel } from './src/utils/model/model.ts';
  assert.equal(parseUserSpecifiedModel('claude-opus-5-5[1m]'), 'claude-opus-5-5');
  assert.equal(parseUserSpecifiedModel('claude-sonnet-4-6[1m]'), 'claude-sonnet-4-6[1m]');
`))

test('317 catalog pricing updates cost accounting and public model price strings', () => run(`
  import { calculateCostFromTokens, getModelPricingString } from './src/utils/modelCost.ts';
  const tokens = { inputTokens: 1000000, outputTokens: 1000000, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 };
  assert.equal(calculateCostFromTokens('claude-opus-5-5', tokens), 24);
  assert.equal(calculateCostFromTokens('claude-sonnet-5-5', tokens), 12);
  assert.equal(calculateCostFromTokens('claude-haiku-5-5', tokens), 3);
  assert.equal(calculateCostFromTokens('claude-fable-5-1', tokens), 60);
  assert.equal(getModelPricingString('claude-opus-5-5'), '$4/$20 per Mtok');
  assert.equal(getModelPricingString('claude-sonnet-5-5'), '$2/$10 per Mtok');
`))

test('317 cost accounting includes long prompts, one-hour cache writes, US geography and fast responses', () => run(`
  import { calculateUSDCost } from './src/utils/modelCost.ts';
  const base = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 1000000 };
  assert.equal(calculateUSDCost('claude-opus-5-5', { ...base, cache_creation: { ephemeral_1h_input_tokens: 500000 } }), 6.5);
  assert.equal(calculateUSDCost('claude-opus-5-5', { ...base, cache_creation: { ephemeral_1h_input_tokens: 2000000 } }), 8);
  assert.equal(calculateUSDCost('claude-opus-5-5', { ...base, input_tokens: 1000000, cache_creation_input_tokens: 0, inference_geo: 'us', server_tool_use: { web_search_requests: 1 } }), 4.41);
  assert.equal(calculateUSDCost('claude-opus-5-5', { ...base, input_tokens: 1000000, cache_creation_input_tokens: 0, speed: 'fast' }), 8);
  assert.ok(Math.abs(calculateUSDCost('claude-haiku-5-5', { ...base, input_tokens: 100000, cache_creation_input_tokens: 0 }) - 0.01) < 1e-12);
  assert.equal(calculateUSDCost('claude-haiku-5-5', { ...base, input_tokens: 100001, cache_creation_input_tokens: 0 }), 0.0500005);
`))

test('317 thinking support uses model capability rules on every provider, including future model IDs', () => run(`
  import { modelSupportsThinking, modelSupportsAdaptiveThinking } from './src/utils/thinking.ts';
  assert.equal(modelSupportsThinking('claude-haiku-5-5'), true);
  assert.equal(modelSupportsThinking('my-deployment'), true);
  assert.equal(modelSupportsThinking('claude-3-5-sonnet'), false);
  assert.equal(modelSupportsAdaptiveThinking('claude-opus-6'), false);
`, { CLAUDE_CODE_USE_BEDROCK: '1' }))

test('317 first-party unknown model defaults follow current output upper limit and adaptive thinking', () => run(`
  import { getModelMaxOutputTokens, getContextWindowForModel } from './src/utils/context.ts';
  import { modelSupportsAdaptiveThinking } from './src/utils/thinking.ts';
  assert.deepEqual(getModelMaxOutputTokens('my-deployment'), { default: 32000, upperLimit: 128000 });
  assert.equal(modelSupportsAdaptiveThinking('claude-opus-6'), true);
  assert.equal(getContextWindowForModel('my-deployment'), 345678);
  assert.equal(getContextWindowForModel('claude-opus-4-6'), 200000);
`, { CLAUDE_CODE_MAX_CONTEXT_TOKENS: '345678' }))

test('317 model picker labels and pricing follow the model that each alias actually requests', () => run(`
  import { getModelOptions } from './src/utils/model/modelOptions.ts';
  import { parseUserSpecifiedModel, getPublicModelDisplayName } from './src/utils/model/model.ts';
  const options = getModelOptions();
  for (const alias of ['opus', 'haiku']) {
    const entry = options.find(option => option.value === alias || option.value === alias + '[1m]');
    assert.ok(entry, alias);
    assert.equal(entry.label, getPublicModelDisplayName(parseUserSpecifiedModel(alias)));
    assert.doesNotMatch(entry.description, /4[.][156]/);
  }
`))

test('333 inventory keeps first-party-only models and best follows the catalog', () => run(`
  import { MODEL_CATALOG, getCatalogModelsForProvider, getCatalogPreferredModelsForProvider } from './src/utils/model/modelCatalog.ts';
  import { getBestModel, parseUserSpecifiedModel } from './src/utils/model/model.ts';
  import { getModelOptions } from './src/utils/model/modelOptions.ts';
  assert.equal(MODEL_CATALOG.models.length, 22);
  assert.equal(getCatalogModelsForProvider('first_party').length, 9);
  assert.equal(getCatalogModelsForProvider('bedrock').filter(x => x.family === 'mythos').length, 2);
  assert.equal(MODEL_CATALOG.best, 'fable');
  assert.equal(getBestModel(), 'claude-fable-5-1');
  assert.equal(parseUserSpecifiedModel('best'), getBestModel());
  const preferred = getCatalogPreferredModelsForProvider('first_party');
  assert.deepEqual(preferred.map(x => x.family).sort(), ['fable', 'haiku', 'opus', 'sonnet']);
  const picker = getModelOptions();
  for (const row of preferred) assert.ok(picker.some(option => option.value === row.provider_ids.first_party), row.id);
`))

test('333 provider picker uses provider-resolved defaults rather than unsupported latest models', () => run(`
  import { getCatalogPreferredModelsForProvider } from './src/utils/model/modelCatalog.ts';
  import { getModelOptions } from './src/utils/model/modelOptions.ts';
  const preferred = getCatalogPreferredModelsForProvider('bedrock');
  const picker = getModelOptions();
  for (const row of preferred) assert.ok(picker.some(option => option.value === row.provider_ids.bedrock), row.id);
  assert.equal(preferred.find(x => x.family === 'sonnet')?.id, 'claude-sonnet-5-5');
  assert.equal(picker.some(option => String(option.value).includes('claude-mythos')), false); // access-restricted family
`, { CLAUDE_CODE_USE_BEDROCK: '1' }))

test('333 official Mythos IDs are present in all supported Claude provider configurations', () => run(`
  import { MODEL_CATALOG } from './src/utils/model/modelCatalog.ts';
  import { ALL_MODEL_CONFIGS, CANONICAL_MODEL_IDS } from './src/utils/model/configs.ts';
  import { firstPartyNameToCanonical } from './src/utils/model/model.ts';
  assert.equal(Object.keys(ALL_MODEL_CONFIGS).length, MODEL_CATALOG.models.length);
  assert.equal(CANONICAL_MODEL_IDS.length, 22);
  for (const [key, name] of [['mythos5', 'claude-mythos-5'], ['mythos51', 'claude-mythos-5-1']]) {
    const conf = ALL_MODEL_CONFIGS[key];
    assert.equal(conf.firstParty, name);
    assert.equal(conf.bedrock, 'anthropic.' + name);
    assert.equal(conf.vertex, name);
    assert.equal(conf.foundry, name);
    assert.equal(firstPartyNameToCanonical(conf.bedrock), name);
  }
`))

test('333 preinstalled Claude models contain only 5.x on all API providers', () => run(`
  import { MODEL_CATALOG, getCatalogModel, getCatalogModelsForProvider, getCatalogPreferredModelsForProvider, isLegacyClaudeModel } from './src/utils/model/modelCatalog.ts';
  import { getRegisteredModelInventory } from './src/services/api/multimodel/catalog.ts';
  import { getModelOptions } from './src/utils/model/modelOptions.ts';
  assert.equal(MODEL_CATALOG.models.length, 22); // preserved legacy session lookup table
  for (const provider of ['first_party', 'bedrock', 'vertex', 'foundry']) {
    const rows = getCatalogModelsForProvider(provider);
    assert.equal(rows.length, 9, provider);
    assert.ok(rows.every(row => !isLegacyClaudeModel(row.id)));
    assert.ok(getCatalogPreferredModelsForProvider(provider).every(row => !isLegacyClaudeModel(row.id)));
  }
  assert.equal(getRegisteredModelInventory().filter(row => row.source === 'built-in').length, 9);
  assert.equal(getCatalogModel('claude-sonnet-4-6')?.id, 'claude-sonnet-4-6');
  const options = getModelOptions();
  assert.ok(options.every(option => option.value === null || !isLegacyClaudeModel(option.value)));
  for (const family of ['opus', 'sonnet', 'haiku', 'fable'])
    assert.ok(options.some(option => option.value === family), family);
`))

test('333 explicitly selected Claude 4.x model stays available for existing sessions', () => run(`
  import { getModelOptions } from './src/utils/model/modelOptions.ts';
  import { parseUserSpecifiedModel } from './src/utils/model/model.ts';
  assert.equal(parseUserSpecifiedModel('claude-sonnet-4-6'), 'claude-sonnet-4-6');
  const rows = getModelOptions();
  assert.equal(rows.filter(row => row.value === 'claude-sonnet-4-6').length, 1);
`, { ANTHROPIC_MODEL: 'claude-sonnet-4-6' }))

test('333 Bedrock default aliases and picker only expose current Claude presets', () => run(`
  import { getModelOptions } from './src/utils/model/modelOptions.ts';
  import { parseUserSpecifiedModel } from './src/utils/model/model.ts';
  import { isLegacyClaudeModel } from './src/utils/model/modelCatalog.ts';
  for (const family of ['opus', 'sonnet', 'haiku']) {
    assert.equal(isLegacyClaudeModel(parseUserSpecifiedModel(family)), false, family);
  }
  assert.ok(getModelOptions().every(row => row.value === null || !isLegacyClaudeModel(row.value)));
`, { CLAUDE_CODE_USE_BEDROCK: '1' }))
