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
  assert.match(pkg.scripts['test:all'], /node --test tests\/[^ ]+\.test\.mjs/)
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

test('主测试套件的 MJS 与 TypeScript 测试分别使用对应运行器', () => {
  const pkg = JSON.parse(readFileSync(file('package.json'), 'utf8'))
  for (const name of ['test:all', 'test:m2']) {
    const parts = pkg.scripts[name].split(/\s*&&\s*/)
    assert.equal(parts.length, name === 'test:all' ? 3 : 2,
      name + ': expected unified Node/Bun suites followed by inventory for the full run')
    if (name === 'test:all') {
      assert.equal(parts[2], 'node build/run-unregistered-tests.mjs',
        'test:all must actually run all unregistered tests')
    }
    assert.match(parts[0], /^node --test /, name)
    assert.match(parts[1], /^bun test /, name)
    const nodeFiles = parts[0].replace(/^node --test /, '').trim().split(/\s+/)
    const bunFiles = parts[1].replace(/^bun test /, '').trim().split(/\s+/)
    assert.ok(nodeFiles.every(path => path.endsWith('.test.mjs')),
      name + ': Node should execute only MJS tests')
    assert.ok(bunFiles.every(path => path.endsWith('.test.ts')),
      name + ': Bun should execute TypeScript tests in these suites')
    const combined = [...nodeFiles, ...bunFiles]
    assert.equal(new Set(combined).size, combined.length, name + ': duplicate test files')
    for (const path of combined) assert.ok(existsSync(file(path)), name + ': missing ' + path)
  }
})

test('全量入口覆盖每个专项声明的测试文件', () => {
  const scripts = JSON.parse(readFileSync(file('package.json'), 'utf8')).scripts
  const fullFiles = new Set(scripts['test:all'].match(/tests\/[^\s]+\.test\.(?:mjs|ts)/g))
  for (const [name, command] of Object.entries(scripts)) {
    if (name === 'test:all') continue
    for (const path of command.match(/tests\/[^\s]+\.test\.(?:mjs|ts)/g) ?? []) {
      assert.ok(fullFiles.has(path), name + ': full run omits ' + path)
    }
  }
})
