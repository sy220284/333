import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { test } from 'node:test'

const root = resolve(import.meta.dirname, '..')
const source = file => readFileSync(resolve(root, file), 'utf8')

test('摇摇车 owns its CLI entrypoint without shadowing the official claude executable', () => {
  const pkg = JSON.parse(source('package.json'))
  assert.deepEqual(pkg.bin, { yaoyaoche: 'dist/launcher.cjs' })
  assert.equal(pkg.name, '@yaoyaoche/agent-cli')
  const launcher = source('build/release-launcher.cjs')
  assert.ok(launcher.includes("'yaoyaoche.exe' : 'yaoyaoche'"))
  assert.ok(source('build/package-release.mjs').includes("bin: { yaoyaoche: './launcher.cjs' }"))
  const native = source('src/utils/nativeInstaller/installer.ts')
  assert.ok(native.includes("'yaoyaoche.exe' : 'yaoyaoche'"))
  assert.ok(native.includes("const ownPackage = '@yaoyaoche/agent-cli'"))
  assert.doesNotMatch(native, /attemptNpmUninstall\(\s*'@anthropic-ai\/claude-code'/)
})
test('摇摇车 keeps its configuration, temporary files and browser links separate', () => {
  const config = source('src/utils/envUtils.ts')
  assert.ok(config.includes("join(homedir(), '.yaoyaoche')"))
  assert.ok(source('src/utils/env.ts').match(/`\.yaoyaoche\$\{fileSuffixForOauthConfig\(\)\}\.json`/))
  assert.ok(source('src/utils/permissions/filesystem.ts').match(/return `yaoyaoche-\$\{uid\}`/))
  assert.ok(source('src/utils/deepLink/parseDeepLink.ts').includes("'yaoyaoche'"))
  assert.ok(source('src/utils/shellConfig.ts').includes('alias\\s+yaoyaoche'))
})
test('Model requests identify the actual independent agent and preserve historical prefixes', () => {
  const http = source('src/utils/http.ts')
  assert.ok(http.match(/yaoyaoche-cli\/\$\{MACRO\.VERSION\}/))
  assert.ok(http.match(/yaoyaoche\/\$\{MACRO\.VERSION\}/))
  assert.doesNotMatch(http, /Claude-User/)
  assert.ok(source('src/components/LogoV2/CondensedLogo.tsx').includes('stringWidth(versionPrefix)'))
  const system = source('src/constants/system.ts')
  assert.ok(system.includes('You are 摇摇车'))
  assert.ok(system.includes('You are 333, an independent'))
  assert.ok(system.includes("Anthropic's official CLI for Claude"))
})
test('Pinned official skill remains unchanged while the active update-config prompt uses 摇摇车', () => {
  const manifest = JSON.parse(source('build/official-embedded-assets-2.1.317.json'))
  const record = manifest.resources.find(item => item.path === 'src/skills/bundled/claude-config/SKILL.md')
  assert.ok(record)
  const original = readFileSync(resolve(root, record.path))
  assert.equal(original.length, record.bytes)
  assert.equal(createHash('sha256').update(original).digest('hex'), record.sha256)
  assert.ok(source('src/skills/bundled/updateConfig.ts').includes('Modify 摇摇车 configuration'))
})
test('GitHub review command, workflow and report agree on the same brand and paths', () => {
  const workflow = source('src/commands/github/workflow.ts')
  const script = source('src/commands/github/reviewerScript.ts')
  assert.ok(workflow.includes('yaoyaoche-review.yml'))
  assert.ok(workflow.includes('yaoyaoche-review-report.md'))
  assert.ok(script.includes("writeFileSync('yaoyaoche-review-report.md'"))
  assert.ok(workflow.includes('/yaoyaoche review'))
  assert.ok(script.includes('/yaoyaoche review'))
})
