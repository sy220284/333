import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
const root = resolve(import.meta.dirname, '..')
const source = path => readFileSync(resolve(root, path), 'utf8')
test('独立系统身份与历史会话前缀隔离', () => {
  const s = source('src/constants/system.ts')
  assert.ok(s.includes('const DEFAULT_PREFIX = `You are Qerivon'))
  assert.ok(s.includes('const LEGACY_PREFIXES'))
  assert.ok(source('src/services/api/claude.ts').includes('getCLISyspromptPrefix'))
})
test('Git 作者身份默认由用户控制，官方插件不自动安装', () => {
  assert.doesNotMatch(source('src/screens/REPL.tsx'), /useOfficialMarketplaceNotification/)
  assert.equal(existsSync(resolve(root,'src/hooks/useOfficialMarketplaceNotification.tsx')), false)
  const s = source('src/utils/attribution.ts')
  assert.ok(s.includes("const defaultCommit = ''"))
  assert.ok(s.includes('includeCoAuthoredBy === true'))
})
test('过期推广清理并保留通用 GitHub 接口', () => {
  assert.doesNotMatch(source('src/commands.ts'), /import upgrade from/)
  const t = source('src/services/tips/tipRegistry.ts')
  assert.doesNotMatch(t, /\/install-slack-app|\/mobile|\/install-github-app|@claude/)
  assert.ok(t.includes("'github-integration'"))
  assert.ok(t.includes("'feedback-command'"))
})
test('Qerivon 独立包名与原生更新来源受约束', () => {
  const build = source('build/rebuild.mjs')
  assert.ok(build.includes("'MACRO.PACKAGE_URL': '\"@qerivon/agent-cli\"'"))
  assert.ok(!build.includes("'MACRO.PACKAGE_URL': '\"@anthropic-ai"))
  const release = source('src/utils/releaseSource.ts')
  assert.ok(release.includes('QERIVON_NATIVE_RELEASE_BASE_URL'))
  assert.ok(release.includes('claude-code-dist'))
  for (const p of ['src/utils/nativeInstaller/download.ts','src/utils/autoUpdater.ts']) {
    assert.ok(!source(p).includes('claude-code-dist-86c565'))
  }
})

test('独立模型主请求与辅助请求不注入原厂计费头', () => {
  const main = source('src/services/api/claude.ts')
  const side = source('src/utils/sideQuery.ts')
  assert.ok(main.includes("independentRoute ? '' : getAttributionHeader(fingerprint)"))
  assert.match(side, /const attributionHeader = resolveIndependentModel\(model\)/)
})

test('安装器清理只处理 Qerivon 包，不触碰独立 Claude 安装目录', () => {
  const installer = source('src/utils/nativeInstaller/installer.ts')
  const doctor = source('src/utils/doctorDiagnostic.ts')
  assert.ok(installer.includes("const ownPackage = '@qerivon/agent-cli'"))
  assert.doesNotMatch(installer.slice(installer.indexOf('export async function cleanupNpmInstallations')), /rm\(localInstallDir|attemptNpmUninstall\(\s*'@anthropic-ai\/claude-code'/)
  assert.ok(doctor.includes("const packagesToCheck = ['@qerivon/agent-cli']"))
  assert.doesNotMatch(doctor, /uninstall @anthropic-ai\/claude-code/)
})
