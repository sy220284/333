#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// A pinned compiler is installed by the Chinese UI workflow into RUNNER_TEMP.
// Syntax verification must use an actual parser: regex-only translation passes
// can corrupt variable names, imports, JSX identifiers and type annotations.
const compilerPath = process.env.TS_COMPILER_PATH
if (!compilerPath) throw new Error('TS_COMPILER_PATH must point to the pinned TypeScript compiler')
const ts = (await import(pathToFileURL(resolve(compilerPath)).href)).default

const targets = process.argv.slice(2)
const roots = targets.length > 0 ? targets : ['src']
const violations = []
let scanned = 0
const HAN = /[\u3400-\u9fff]/

function inspect(path) {
  if (!/\.(?:ts|tsx|js|jsx|mts|cts|mjs|cjs)$/.test(path)) return
  const content = readFileSync(path, 'utf8').split('//# sourceMappingURL=')[0]
  const kind = /\.tsx$|\.jsx$/.test(path) ? ts.ScriptKind.TSX
    : /\.(?:js|mjs|cjs)$/.test(path) ? ts.ScriptKind.JS : ts.ScriptKind.TS
  const source = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true, kind)
  scanned++
  for (const problem of source.parseDiagnostics) {
    const {line, character} = source.getLineAndCharacterOfPosition(problem.start ?? 0)
    violations.push(`${path}:${line+1}:${character+1} syntax ${ts.flattenDiagnosticMessageText(problem.messageText, ' ')}`)
  }
  function visit(node) {
    // Language-alias dictionaries may legitimately use native words as keys
    // (e.g. { 日本語: 'ja' }). Check references/declarations, not these keys.
    const dictionaryKey = ts.isPropertyAssignment(node.parent) && node.parent.name === node
    if (ts.isIdentifier(node) && HAN.test(node.text) && !dictionaryKey) {
      const {line, character} = source.getLineAndCharacterOfPosition(node.getStart(source))
      violations.push(`${path}:${line+1}:${character+1} translated identifier ${node.text}`)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
}

function walk(path) {
  const entries = readdirSync(path, {withFileTypes: true})
  for (const item of entries) {
    if (item.name === 'node_modules' || item.name === '.git') continue
    const name = join(path, item.name)
    if (item.isDirectory()) walk(name)
    else if (item.isFile()) inspect(name)
  }
}

for (const root of roots) {
  const entries = readdirSync(root, {withFileTypes: true})
  if (entries.length || root.endsWith('/')) walk(root)
}
console.log(`[中文源码完整性] 已检查 ${scanned} 个源码文件；发现 ${violations.length} 个语法或标识符问题`)
for (const item of violations.slice(0, 100)) console.error(item)
if (violations.length > 100) console.error(`还有 ${violations.length - 100} 个问题`)
if (violations.length) process.exitCode = 1
