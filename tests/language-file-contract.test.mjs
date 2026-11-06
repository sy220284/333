import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../', import.meta.url))
const file = path => resolve(root, path)
const bundled = join('src', 'skills', 'bundled') + sep
function walk(path) {
  const found = []
  for (const entry of readdirSync(file(path), { withFileTypes: true })) {
    const child = join(path, entry.name)
    if (entry.isDirectory()) found.push(...walk(child))
    else if (entry.isFile()) found.push(child)
  }
  return found
}

test('核心 TypeScript 实现不得经由同名 MJS 测试转接入口导入', () => {
  const failures = []
  // Include bundled skill implementations; their TypeScript is production
  // code too. Path aliases (src/...) must obey the same canonical rule.
  for (const source of walk('src').filter(p => /\.tsx?$/.test(p))) {
    const text = readFileSync(file(source), 'utf8')
    const imports = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*|\brequire\s*\(\s*)['"`]((?:\.{1,2}\/|src\/)[^'"`]+\.mjs)['"`]/g
    for (const match of text.matchAll(imports)) {
      const original = match[1].startsWith('src/')
        ? file(match[1])
        : resolve(dirname(file(source)), match[1])
      const canonical = original.slice(0, -4) + '.ts'
      if (existsSync(canonical)) {
        failures.push(relative(root, file(source)) + ': ' + match[1] + ' -> ' +
          relative(root, canonical))
      }
    }
  }
  assert.deepEqual(failures, [], '生产模块应直接引用 .ts；.mjs 转接仅保留给 Node 测试')
})

test('TypeScript 组件导入应使用实际存在的 TSX 路径', () => {
  const mismatches = []
  for (const source of walk('src').filter(p => /\.tsx?$/.test(p) && !p.startsWith(bundled))) {
    const text = readFileSync(file(source), 'utf8')
    const imports = /\bfrom\s*['"](\.{1,2}\/[^'"]+\.jsx)['"]/g
    for (const match of text.matchAll(imports)) {
      const actual = resolve(dirname(file(source)), match[1])
      const canonical = actual.slice(0, -4) + '.tsx'
      if (!existsSync(actual) && existsSync(canonical)) {
        mismatches.push(relative(root, file(source)) + ': ' + match[1] + ' -> ' +
          relative(root, canonical))
      }
    }
  }
  assert.deepEqual(mismatches, [], '导入路径须指向真实 TypeScript/TSX 源码')
})

test('迁移后的 MJS 入口仅转接同名 TypeScript 源码', () => {
  const failures = []
  for (const source of walk('src').filter(p => p.endsWith('.mjs') &&
    !p.startsWith(bundled))) {
    const canonical = source.slice(0, -4) + '.ts'
    if (!existsSync(file(canonical))) continue
    const text = readFileSync(file(source), 'utf8')
    const expected = './' + basename(source).slice(0, -4) + '.ts'
    const code = text.split('\n').filter(line => !/^\s*(?:\/\/|$)/.test(line)).join('\n').trim()
    if (code !== "export * from '" + expected + "';" &&
        code !== "export * from '" + expected + "'" &&
        code !== 'export * from "' + expected + '";' &&
        code !== 'export * from "' + expected + '"') {
      failures.push(source + ': unexpected executable MJS implementation')
    }
  }
  assert.deepEqual(failures, [], '项目自有核心逻辑的唯一实现应位于 TypeScript 文件')
})

test('Node 工具、官方扩展、压缩资源与原生二进制保留各自格式', () => {
  const required = [
    'build/rebuild.mjs', 'build/package-release.mjs',
    'build/check-test-syntax.mjs', 'tools/dev/dev.mjs',
    'tests/m3-plugin-eval-engine-317.test.mjs',
    'src/entrypoints/cli.tsx', 'src/main.tsx',
    'src/utils/yaml.ts',
    'native/audio-capture-src/index.ts',
    'src/skills/bundled/artifact-diagramming/assets/mermaid.min.js',
    'src/skills/bundled/data-visualization/assets/chart.umd.min.js',
    'src/skills/bundled/artifact-design/assets/hljsBundle.generated.min.js',
    'src/skills/bundled/claude-test-conversation/scripts/ct.mjs',
    'src/skills/bundled/official-extras/appifact_sdk.js',
  ]
  for (const path of required) assert.ok(existsSync(file(path)), 'Missing original-format file: ' + path)
  const attrs = readFileSync(file('.gitattributes'), 'utf8')
  for (const path of required.filter(p => p.endsWith('.min.js'))) {
    assert.ok(attrs.split(/\r?\n/).some(line => line.startsWith(path + ' ') &&
      line.includes('-text') && line.includes('-eol')), 'Compressed binary extension must retain original bytes: ' + path)
  }
  const natives = walk('vendor').filter(p => extname(p) === '.node')
  assert.ok(natives.length > 0, 'Native platform binaries must remain in vendor/')
  const tsconfig = JSON.parse(readFileSync(file('tsconfig.json'), 'utf8'))
  assert.equal(tsconfig.compilerOptions.allowImportingTsExtensions, true)
  const pkg = JSON.parse(readFileSync(file('package.json'), 'utf8'))
  assert.match(pkg.scripts.rebuild, /node build\/[^ ]+\.mjs/)
  assert.match(pkg.scripts['test:node'], /^node --test tests\/[^ ]+\.test\.mjs/)
  assert.equal(pkg.scripts['test:all'], 'npm run test:core && node build/run-unregistered-tests.mjs --ci-supplemental')
})

test('Node 测试入口只直接运行 MJS，TypeScript 测试交给 Bun', () => {
  const pkg = JSON.parse(readFileSync(file('package.json'), 'utf8'))
  for (const [name, command] of Object.entries(pkg.scripts ?? {})) {
    for (const part of command.split(/\s*&&\s*/)) {
      if (!/^node --test(?:\s|$)/.test(part.trim())) continue
      assert.doesNotMatch(part, /(?:^|\s)\S+\.test\.ts(?:\s|$)/,
        name + ': Node --test should run .mjs; run .test.ts through Bun')
    }
  }
})

test('主测试套件按 Node/Bun 分类执行并包含未注册用例扫描', () => {
  const scripts = JSON.parse(readFileSync(file('package.json'), 'utf8')).scripts
  assert.equal(scripts['test:core'], 'npm run test:node && npm run test:bun')
  assert.equal(scripts['test:all'], 'npm run test:core && node build/run-unregistered-tests.mjs --ci-supplemental')
  for (const [name, runtime, suffix] of [
    ['test:node', 'node --test ', '.test.mjs'],
    ['test:bun', 'bun test ', '.test.ts'],
  ]) {
    const command = scripts[name]
    const parts = command.split(/\s*&&\s*/)
    // OAuth suites deliberately run in fresh Bun processes: retain the
    // language contract for direct files and require the isolated sub-suite.
    if (name === 'test:bun') {
      assert.equal(parts.pop(), 'npm run test:multimodel',
        'Bun must run ChatGPT account tests through the isolated suite')
    }
    assert.equal(parts.length, 1, name + ': unexpected command chaining')
    const direct = parts[0]
    assert.ok(direct.startsWith(runtime), name + ': wrong runtime')
    const files = direct.slice(runtime.length).trim().split(/\s+/)
    assert.ok(files.length > 0 && files.every(path => path.endsWith(suffix)), name + ': wrong test format')
    assert.equal(new Set(files).size, files.length, name + ': duplicates')
    for (const path of files) assert.ok(existsSync(file(path)), name + ': missing ' + path)
  }
  const supplementary = readFileSync(file('build/run-unregistered-tests.mjs'), 'utf8')
  assert.match(supplementary, /discoverUnregisteredTests/)
  assert.match(supplementary, /CI_SUPPLEMENTAL/)
  assert.match(supplementary, /runTest\(/)
})

test('全量测试中所有专项用例均被主清单或补充扫描收录', () => {
  const scripts = JSON.parse(readFileSync(file('package.json'), 'utf8')).scripts
  const main = new Set([
    ...(scripts['test:node'].match(/tests\/[^\s]+\.test\.mjs/g) ?? []),
    ...(scripts['test:bun'].match(/tests\/[^\s]+\.test\.ts/g) ?? []),
    ...(scripts['test:multimodel'].match(/tests\/[^\s]+\.test\.ts/g) ?? []),
  ])
  assert.ok(main.size > 0)
  assert.match(scripts['test:all'], /node build\/run-unregistered-tests\.mjs --ci-supplemental/)
  const supplementary = readFileSync(file('build/run-unregistered-tests.mjs'), 'utf8')
  assert.match(supplementary, /const pending = tests\.filter/)
  assert.match(supplementary, /supplemental \|\|/)
  assert.match(supplementary, /runTest\(/)
  for (const [name, command] of Object.entries(scripts)) {
    if (['test:node', 'test:bun', 'test:core', 'test:all'].includes(name)) continue
    for (const path of command.match(/tests\/[^\s]+\.test\.(?:mjs|ts)/g) ?? []) {
      assert.ok(existsSync(file(path)), name + ': missing ' + path)
      assert.ok(main.has(path) || supplementary.includes('const pending = tests.filter'), name + ': not inventoried ' + path)
    }
  }
})
