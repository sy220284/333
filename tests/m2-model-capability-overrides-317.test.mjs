import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '..')
function check(script) {
  const result = spawnSync('bun', ['-e', `
    import assert from 'node:assert/strict'
    import { get3PModelCapabilityOverride as capability } from './src/utils/model/modelSupportOverrides.ts'
    for (const key of Object.keys(process.env)) {
      if (/^CLAUDE_CODE_USE_|^ANTHROPIC_DEFAULT_|^ANTHROPIC_CUSTOM_MODEL_OPTION/.test(key)) delete process.env[key]
    }
    ${script}
  `], { cwd: root, encoding: 'utf8', timeout: 10000 })
  assert.equal(result.status, 0, result.stderr)
}

test('317 capability overrides include Fable and custom model slots with trimmed pinned IDs', () => check(`
  process.env.CLAUDE_CODE_USE_BEDROCK = '1'
  process.env.ANTHROPIC_DEFAULT_FABLE_MODEL = '  Provider/Fable  '
  process.env.ANTHROPIC_DEFAULT_FABLE_MODEL_SUPPORTED_CAPABILITIES = 'effort, xhigh_effort'
  process.env.ANTHROPIC_CUSTOM_MODEL_OPTION = 'My-Custom-Model'
  process.env.ANTHROPIC_CUSTOM_MODEL_OPTION_SUPPORTED_CAPABILITIES = 'thinking,max_effort'
  assert.equal(capability('provider/fable', 'effort'), true)
  assert.equal(capability('provider/fable', 'xhigh_effort'), true)
  assert.equal(capability('provider/fable', 'max_effort'), false)
  assert.equal(capability('my-custom-model', 'max_effort'), true)
  assert.equal(capability('my-custom-model', 'effort'), false)
`))

test('317 capability matching removes only the trailing 1m suffix and keeps deployment boundaries', () => check(`
  process.env.CLAUDE_CODE_USE_VERTEX = '1'
  process.env.ANTHROPIC_DEFAULT_OPUS_MODEL = 'My-Opus'
  process.env.ANTHROPIC_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES = 'effort'
  assert.equal(capability('MY-OPUS[1M]', 'effort'), true)
  assert.equal(capability('my-opus[2m]', 'effort'), undefined)
  assert.equal(capability('my-opus-other', 'effort'), undefined)
  assert.equal(capability('my-opus[1m]-other', 'effort'), undefined)
`))

test('317 first-party requests ignore third-party pinned capability declarations', () => check(`
  process.env.ANTHROPIC_DEFAULT_FABLE_MODEL = 'my-model'
  process.env.ANTHROPIC_DEFAULT_FABLE_MODEL_SUPPORTED_CAPABILITIES = 'effort'
  assert.equal(capability('my-model', 'effort'), undefined)
`))

test('317 an explicitly empty capability declaration disables capabilities in slot priority order', () => check(`
  process.env.CLAUDE_CODE_USE_FOUNDRY = '1'
  process.env.ANTHROPIC_DEFAULT_FABLE_MODEL = 'same-model[1m]'
  process.env.ANTHROPIC_DEFAULT_FABLE_MODEL_SUPPORTED_CAPABILITIES = ''
  process.env.ANTHROPIC_DEFAULT_OPUS_MODEL = 'same-model'
  process.env.ANTHROPIC_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES = 'effort'
  assert.equal(capability('same-model', 'effort'), false)
`))
