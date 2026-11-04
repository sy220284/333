import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

// Hashes from separately extracted, SHA-verified Claude Code 2.1.317 Linux
// x64 embedded assets. These guard native content and all six /run examples.
const nativeSha256 = {
  "claude-api/SKILL.md": "35c1458f04fcfddc6d3f46faa6c66e9b44ba71709daf343a8e63a05a63eb976d",
  "run-skill-generator/SKILL.md": "0809696a81a4c063a02f12df590a79a41d9595618e9825309c5a6cebb1320486",
  "run-skill-generator/run-unit-SKILL.md": "bf8228e1e384ae86797434e6d7e4110f61e36029277b7f3e325efc6d3db0631b",
  "run-skill-generator/template.md": "1d20337942195ad5f19aa8231589bfa73bf50aa62ab8789eb5cab13e5ab8d913",
  "run-skill-generator/examples/cli.md": "77ea27d9d28d072af1b39f71f64a6a04deaa1aca83d50dfbd9daa0b85daf680f",
  "run-skill-generator/examples/electron.md": "dff7e5927be5d44350ec0be741aa54382e8c58ce71ade6de8c747d6e6f653a94",
  "run-skill-generator/examples/library.md": "790eb1311562d52ecf9b7dc4e069cdc32806d3875011c022bc3ac4419d76a375",
  "run-skill-generator/examples/playwright.md": "0bbfc3f9bec393d38009ee02869b059ef3ff1f055fa4d87aa930250dbb0afe6c",
  "run-skill-generator/examples/server.md": "68491d513be6aab5e6c5c5d6850c269ca1d790ebeb2da98747de2013788f9a8f",
  "run-skill-generator/examples/tui.md": "dd87886e8c29f89e9cedc4fdd631dfb079718c5650764716f164851aa072abc1"
}

const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('2.1.317: official /run, generator and Claude API assets are byte identical', () => {
  for (const [name, expected] of Object.entries(nativeSha256)) {
    const content = readFileSync(new URL(`../src/skills/bundled/${name}`, import.meta.url))
    const actual = createHash('sha256').update(content).digest('hex')
    assert.equal(actual, expected, name)
  }
})

test('2.1.317: both native run skills register in full CLI sessions', () => {
  const registry = source('src/skills/bundled/index.ts')
  assert.ok(registry.includes("process.env.CLAUDE_CODE_ENTRYPOINT !== 'local-agent'"))
  assert.ok(registry.includes('registerRunSkill()'))
  assert.ok(registry.includes('registerRunSkillGeneratorSkill()'))
  assert.ok(registry.includes('registerClaudeApiSkill()'))
  assert.doesNotMatch(registry, /feature\('RUN_SKILL_GENERATOR'\)/)
  assert.doesNotMatch(registry, /feature\('BUILDING_CLAUDE_APPS'\)/)

  const run = source('src/skills/bundled/runSkill.ts')
  assert.ok(run.includes("name: 'run'"))
  assert.ok(run.includes('userInvocable: true'))
  for (const example of ['cli', 'electron', 'library', 'playwright', 'server', 'tui']) {
    assert.ok(run.includes(`'examples/${example}.md': ${example}`), example)
  }
  const generator = source('src/skills/bundled/runSkillGenerator.ts')
  assert.ok(generator.includes("name: 'run-skill-generator'"))
  assert.ok(generator.includes('disableModelInvocation: true'))
  assert.ok(generator.includes("'template.md': template"))
  const claudeApi = source('src/skills/bundled/claudeApi.ts')
  assert.ok(claudeApi.includes('isEnabled: () => !isEnvTruthy('))
})
