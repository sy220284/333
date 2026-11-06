import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative, resolve, dirname } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const sourceRoot = join(root, 'src')
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts', '.cjs', '.md', '.txt'])
const files = []
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name)
    if (entry.isDirectory()) walk(file)
    else if (entry.isFile() && sourceExtensions.has(extname(file))) files.push(file)
  }
}
walk(sourceRoot)

const retired = [
  'src/components/LogoV2/Clawd.tsx',
  'src/components/LogoV2/AnimatedClawd.tsx',
  'src/components/LogoV2/clawdAnimationData.ts',
  'src/components/LogoV2/clawdAnimationData.mjs',
  'src/components/LogoV2/clawdAnimationSelection.ts',
  'src/hooks/useOfficialMarketplaceNotification.tsx',
  'src/commands/upgrade/index.ts',
  'src/commands/upgrade/upgrade.tsx',
  'src/constants/github-app.ts',
]
const errors = []
for (const path of retired) if (existsSync(join(root, path))) errors.push(`退役源码仍存在: ${path}`)

const uiBrandHits = []
const missingImports = []
let uiFiles = 0
let importCount = 0
const importRE = /(?:\bfrom\s*|\bimport\s*\(|\brequire\s*\(|\bimport\s+)['"]([^'"\n]+)['"]/g
const extensions = ['.ts','.tsx','.mjs','.js','.mts','.jsx','.cjs','.json','.md','.txt','.d.ts','.d.mts']
function resolveLocal(from, specifier) {
  let base
  if (specifier.startsWith('src/')) base = join(root, specifier)
  else if (specifier.startsWith('./') || specifier.startsWith('../')) base = resolve(dirname(from), specifier)
  else return null
  const options = [base, ...extensions.map(ext => base.replace(/\.(?:js|jsx|mjs)$/, '') + ext)]
  for (const target of options) if (existsSync(target)) return target
  return base
}
for (const file of files) {
  const path = relative(root, file).replaceAll('\\', '/')
  const content = readFileSync(file, 'utf8').split('//# sourceMappingURL=')[0]
  const isUI = /^src\/(?:components|screens|commands)\//.test(path)
  if (isUI) {
    uiFiles++
    const lines = content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (/Claude Code|Anthropic|Clawd|claude\.com\/claude-code|@anthropic/i.test(lines[i])) {
        uiBrandHits.push({ file: path, line: i + 1, text: lines[i].trim().slice(0, 160) })
      }
    }
  }
  for (const match of content.matchAll(importRE)) {
    const specifier = match[1]
    if (!specifier.startsWith('.') && !specifier.startsWith('src/')) continue
    importCount++
    const resolved = resolveLocal(file, specifier)
    if (resolved && !existsSync(resolved)) {
      missingImports.push({ file: path, import: specifier, resolved: relative(root, resolved) })
    }
  }
}

const protectedUI = [
  'src/components/LogoV2/LogoV2.tsx',
  'src/components/LogoV2/CondensedLogo.tsx',
  'src/components/HelpV2/HelpV2.tsx',
  'src/components/HelpV2/General.tsx',
  'src/screens/REPL.tsx',
]
for (const path of protectedUI) {
  const content = readFileSync(join(root, path), 'utf8').split('//# sourceMappingURL=')[0]
  if (/Claude Code v|<Clawd|AnimatedClawd|useOfficialMarketplaceNotification|anthropics\/claude-code/.test(content)) {
    errors.push(`用户主界面残留原厂品牌或已删除入口: ${path}`)
  }
}
const commitPrompt = readFileSync(join(root, 'src/commands/commit-push-pr.ts'),'utf8')
if (/--(?:add-)?reviewer anthropics\/claude-code/.test(commitPrompt)) {
  errors.push('PR 创建仍会自动指派原厂审查人')
}
for (const hit of missingImports) {
  if (retired.some(path => hit.resolved.replace(/\.js$/, '.ts') === path || hit.resolved === path)) {
    errors.push(`仍引用已删除模块: ${hit.file} -> ${hit.import}`)
  }
}
const report = {
  scannedSourceFiles: files.length,
  scannedUIFiles: uiFiles,
  resolvedImportCandidates: importCount,
  missingImportCount: missingImports.length,
  missingImportSamples: missingImports.slice(0, 70),
  brandedUIOccurrences: uiBrandHits.length,
  brandedUISamples: uiBrandHits.slice(0, 100),
  errors,
}
console.log(JSON.stringify(report, null, 2))
if (files.length < 1000 || uiFiles < 400) {
  console.error('审计文件覆盖量异常，请检查源码扫描路径')
  process.exitCode = 1
}
if (errors.length) process.exitCode = 1
