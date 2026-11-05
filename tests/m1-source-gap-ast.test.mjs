import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const scanner = resolve(import.meta.dirname, '../build/m1-source-gap-ast.mjs')

test('M1 AST 缺口扫描解析 JSX 到 TSX、资源导入，同时保留真正缺失的引用', () => {
  const root = mkdtempSync(join(tmpdir(), 'm1-ast-resource-'))
  try {
    const src = join(root, 'src')
    const assets = join(src, 'assets')
    mkdirSync(assets, { recursive: true })
    writeFileSync(join(src, 'main.ts'), [
      "import './widget.jsx'",
      "import './legacy.jsx'",
      "import './present.js'",
      "import './assets/SKILL.md'",
      "import './assets/prompt.txt'",
      "import './assets/config.json'",
      "import type { Missing } from './missingType.js'",
      "import { missing } from './missingRuntime.js'",
      "import './assets/not-found.md'",
      '',
    ].join('\n'))
    writeFileSync(join(src, 'widget.tsx'), 'export const widget = true\n')
    writeFileSync(join(src, 'legacy.jsx'), "import './present.js'\n")
    writeFileSync(join(src, 'present.ts'), 'export const present = true\n')
    writeFileSync(join(assets, 'SKILL.md'), '# Bundled resource\n')
    writeFileSync(join(assets, 'prompt.txt'), 'Prompt resource\n')
    writeFileSync(join(assets, 'config.json'), '{}\n')
    const output = join(root, 'report.json')
    const compiler = process.env.M1_TYPESCRIPT_MODULE
    assert.ok(compiler, 'M1_TYPESCRIPT_MODULE 必须指向固定 TypeScript 编译器')
    execFileSync(process.execPath, [
      scanner, '--old-src', src, '--typescript-module', compiler, '--out', output,
    ], { timeout: 10000, encoding: 'utf8' })
    const report = JSON.parse(readFileSync(output, 'utf8'))
    assert.equal(report.sourceFiles, 4)
    assert.equal(report.uniqueMissingPaths, 3)
    assert.equal(report.references, 3)
    assert.equal(report.typeOnlyReferences, 1)
    assert.equal(report.runtimeReferences, 2)
    assert.equal(report.resolvedReferences, 7)
    assert.deepEqual(report.records.map(x => x.module).sort(), [
      'assets/not-found.md', 'missingRuntime.js', 'missingType.js',
    ])
    assert.equal(report.records.find(x => x.module === 'missingType.js').typeOnly, 1)
    assert.equal(report.records.find(x => x.module === 'missingRuntime.js').runtime, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
