#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadAstParser } from '../dev/ast-parser.mjs'
import { dirname } from 'node:path'

// The same version-verified AST parser serves localization, migration and
// governance. An explicitly configured TS_COMPILER_PATH is validated against
// the canonical toolchain manifest by loadAstParser().
const ts = await loadAstParser()

const targets = process.argv.slice(2)
const roots = targets.length > 0 ? targets : ['src']
const violations = []
let scanned = 0
let compressedResources = 0
// These are immutable upstream resources, not application source. Verify their
// pinned bytes before classifying Zstandard payloads; do not skip unknown .js.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const originalManifest = JSON.parse(readFileSync(join(repoRoot, 'build/official-embedded-assets-2.1.317.json'), 'utf8'))
const originalScripts = new Map(originalManifest.resources
  .filter(item => item.path.endsWith('.js'))
  .map(item => [resolve(repoRoot, item.path), item]))
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
const HAN = /[\u3400-\u9fff]/

function inspect(path) {
  if (!/\.(?:ts|tsx|js|jsx|mts|cts|mjs|cjs)$/.test(path)) return
  const bytes = readFileSync(path)
  const pinned = originalScripts.get(resolve(path))
  if (pinned) {
    const hash = createHash('sha256').update(bytes).digest('hex')
    if (bytes.length !== pinned.bytes || hash !== pinned.sha256) {
      violations.push(`${path} original resource checksum mismatch`)
      return
    }
    if (bytes.subarray(0, 4).equals(ZSTD_MAGIC)) {
      compressedResources++
      return
    }
  }
  const content = bytes.toString('utf8').split('//# sourceMappingURL=')[0]
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
    const parent = node.parent
    const dictionaryKey = parent != null && ts.isPropertyAssignment(parent) && parent.name === node
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
if (compressedResources) console.log(`已核验 ${compressedResources} 份原版压缩资源的 SHA256`)
for (const item of violations.slice(0, 100)) console.error(item)
if (violations.length > 100) console.error(`还有 ${violations.length - 100} 个问题`)
if (violations.length) process.exitCode = 1
