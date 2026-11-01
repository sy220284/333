#!/usr/bin/env node
/** 源码缺口语法树核验。依赖由 --typescript-module 明确传入，不在验证中猜测或忽略。 */
import { createRequire } from 'node:module'
import { dirname, relative, resolve, join, posix, extname } from 'node:path'
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
const require = createRequire(import.meta.url)
const argv = process.argv.slice(2)
const args = Object.fromEntries(argv.filter((_, i) => i % 2 === 0).map((x, i) => [x, argv[2 * i + 1]]))
const source = args['--old-src'], compiler = args['--typescript-module'], dest = args['--out']
if (!source || !compiler || !dest || !existsSync(source)) throw Error('需提供 --old-src --typescript-module --out；旧源码路径必须存在')
const ts = require(resolve(compiler))
const root = resolve(source)
const extensions = ['.ts', '.tsx', '.mts', '.cts', '.d.ts', '.js', '.jsx', '.mjs', '.cjs']
const files = []
function walk(dir) {
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const absolute = join(dir, d.name)
    if (d.isDirectory()) walk(absolute)
    else if (d.isFile() && /\.(ts|tsx|mts|cts|js|mjs|cjs)$/.test(d.name)) files.push(absolute)
  }
}
walk(root)
const names = new Set(files.map(f => relative(root, f).replaceAll('\\', '/')))
function lookup(from, name) {
  const target = posix.normalize(posix.join(posix.dirname(from), name))
  const suffix = extname(target)
  const base = suffix && ['.js', '.mjs', '.cjs'].includes(suffix) ? target.slice(0, -suffix.length) : target
  const variants = suffix && !['.js', '.mjs', '.cjs'].includes(suffix) ? [target] :
    [target, ...extensions.map(x => base + x), ...(!suffix ? extensions.map(x => posix.join(target, 'index' + x)) : [])]
  return { target, present: variants.some(x => names.has(x)) }
}
const missing = new Map()
let internal = 0, resolved = 0, typeOnly = 0, runtime = 0
for (const file of files) {
  const importer = relative(root, file).replaceAll('\\', '/')
  const sourceText = readFileSync(file, 'utf8')
  const tree = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true)
  function record(specifier, kind, node) {
    if (!specifier.startsWith('.')) return
    internal++
    const match = lookup(importer, specifier)
    if (match.present) { resolved++; return }
    if (kind === 'type') typeOnly++; else runtime++
    const sites = missing.get(match.target) ?? []
    sites.push({ importer, line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1, specifier, kind })
    missing.set(match.target, sites)
  }
  function visit(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause
      const type = !!clause?.isTypeOnly || (!!clause && !clause.name &&
        !!clause.namedBindings && ts.isNamedImports(clause.namedBindings) &&
        clause.namedBindings.elements.length > 0 && clause.namedBindings.elements.every(x => x.isTypeOnly))
      record(node.moduleSpecifier.text, type ? 'type' : 'runtime', node)
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      record(node.moduleSpecifier.text, node.isTypeOnly ? 'type' : 'runtime', node)
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      record(node.argument.literal.text, 'type', node)
    } else if (ts.isCallExpression(node) && node.arguments.length && ts.isStringLiteral(node.arguments[0]) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
      (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      record(node.arguments[0].text, 'runtime', node)
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
}
const records = [...missing].map(([module, sites]) => ({
  module, total: sites.length, typeOnly: sites.filter(x => x.kind === 'type').length,
  runtime: sites.filter(x => x.kind === 'runtime').length, sites,
})).sort((a, b) => b.total - a.total || a.module.localeCompare(b.module))
const report = {
  schema: 1, sourceFiles: files.length, uniqueMissingPaths: records.length,
  references: typeOnly + runtime, typeOnlyReferences: typeOnly, runtimeReferences: runtime,
  resolvedReferences: resolved, inspectedRelativeReferences: internal,
  evidenceGrade: 'AST_IMPORT_ONLY_NOT_FUNCTION_VERIFIED', records,
}
mkdirSync(dirname(resolve(dest)), { recursive: true })
writeFileSync(dest, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ sourceFiles: report.sourceFiles, uniqueMissingPaths: report.uniqueMissingPaths,
  references: report.references, typeOnlyReferences: report.typeOnlyReferences,
  runtimeReferences: report.runtimeReferences }))
