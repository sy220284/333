import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '..')
function run(script, env = {}) {
  const result = spawnSync('bun', ['-e', `
    import assert from 'node:assert/strict'
    import * as effort from './src/utils/effort.ts'
    ${script}
  `], { cwd: root, encoding: 'utf8', timeout: 15000, env: { ...process.env, ...env } })
  assert.equal(result.status, 0, result.stderr)
}

test('317 effort parser and persistence accept xhigh and the med shorthand', () => run(`
  assert.equal(effort.parseEffortValue('xhigh'), 'xhigh')
  assert.equal(effort.parseEffortValue('med'), 'medium')
  assert.equal(effort.toPersistableEffort('xhigh'), 'xhigh')
  assert.equal(effort.toPersistableEffort('max'), undefined)
`))

test('317 model catalog exposes current effort and max capabilities across provider spellings', () => run(`
  for (const model of ['claude-opus-4-8', 'claude-sonnet-5', 'claude-fable-5-1', 'claude-haiku-5-5']) {
    assert.equal(effort.modelSupportsEffort(model), true, model)
    assert.equal(effort.modelSupportsMaxEffort(model), true, model)
    assert.equal(effort.modelSupportsXHighEffort(model), true, model)
  }
  assert.equal(effort.modelSupportsXHighEffort('claude-opus-4-6'), false)
  assert.equal(effort.modelSupportsEffort('claude-sonnet-4-5'), false)
  assert.equal(effort.modelSupportsEffort('eu.anthropic.claude-opus-4-8-v1:0'), true)
`))

test('317 explicit capability disable wins over always-enable and prevents high-effort requests', () => run(`
  assert.equal(effort.modelSupportsEffort('claude-opus-4-8'), false)
  assert.equal(effort.modelSupportsMaxEffort('claude-opus-4-8'), false)
  assert.equal(effort.resolveAppliedEffort('claude-opus-4-8', 'max'), undefined)
`, { CLAUDE_CODE_MODEL_CAPABILITIES: 'claude-opus-4-8=-effort,-max_effort', CLAUDE_CODE_ALWAYS_ENABLE_EFFORT: '1' }))

test('317 applies global then matching model capability declarations in order', () => run(`
  assert.equal(effort.modelSupportsEffort('claude-opus-4-8'), true)
  assert.equal(effort.modelSupportsEffort('claude-sonnet-5'), false)
  assert.equal(effort.modelSupportsMaxEffort('claude-opus-4-8'), false)
`, { CLAUDE_CODE_MODEL_CAPABILITIES: '-effort;claude-opus-*=effort,-max_effort' }))

test('317 xhigh is clamped on older models and retained on capable models', () => run(`
  assert.equal(effort.resolveAppliedEffort('claude-opus-4-6', 'xhigh'), 'high')
  assert.equal(effort.resolveAppliedEffort('claude-opus-4-8', 'xhigh'), 'xhigh')
`))

test('317 defaults follow catalog metadata for every model instead of the old subscriber rules', () => run(`
  import { MODEL_CATALOG } from './src/utils/model/modelCatalog.ts'
  for (const model of MODEL_CATALOG.models) {
    assert.equal(effort.getDefaultEffortForModel(model.id), model.default_effort ?? 'high', model.id)
  }
`))

test('317 effort caps keep the strictest layer and resolve per-model overrides within each layer', () => run(`
  assert.equal(typeof effort.resolveEffortCap, 'function')
  assert.equal(effort.resolveEffortCap('claude-opus-4-8', [
    { maxEffortLevel: 'medium' },
    { maxEffortLevel: 'max' },
  ]), 'medium')
  assert.equal(effort.resolveEffortCap('claude-opus-4-8[1m]', [
    { maxEffortLevel: 'low', modelSettings: { 'claude-opus-4-8': { maxEffortLevel: 'xhigh' } } },
    { maxEffortLevel: 'high' },
  ]), 'high')
  assert.equal(effort.resolveEffortCap('claude-sonnet-5', [
    { modelSettings: { 'claude-opus-4-8': { maxEffortLevel: 'low' } } },
  ]), null)
  assert.equal(effort.resolveEffortCap('claude-opus-4-8', [{ maxEffortLevel: 'max' }]), null)
`))

test('317 context and output budgets use every baked model entry', () => run(`
  import { MODEL_CATALOG } from './src/utils/model/modelCatalog.ts'
  import { getContextWindowForModel, getModelMaxOutputTokens } from './src/utils/context.ts'
  import { modelSupportsAdaptiveThinking } from './src/utils/thinking.ts'
  for (const model of MODEL_CATALOG.models) {
    const tokens = getModelMaxOutputTokens(model.id)
    assert.deepEqual(tokens, { default: model.max_output_tokens.default, upperLimit: model.max_output_tokens.upper }, model.id)
    assert.equal(getContextWindowForModel(model.id), model.context?.window ?? 200000, model.id)
    if (model.capabilities.includes('adaptive_thinking')) assert.equal(modelSupportsAdaptiveThinking(model.id), true, model.id)
  }
`))
