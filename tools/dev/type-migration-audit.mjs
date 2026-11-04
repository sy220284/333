#!/usr/bin/env node
/**
 * TypeScript content-level audit for the 333 migration.
 * Requires the pinned tools/dev TypeScript dependency, installed by dev:bootstrap.
 * Native TypeScript syntax is measured separately from the filename extension.
 */
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const strictModules = new Set([
  'src/entrypoints/startupRouting317.ts',
  'src/utils/cliArgv317.ts',
  'src/utils/telemetry/projectTelemetryPolicy.ts',
  'src/tasks/LocalWorkflowTask/workflowStoragePaths.ts',
  'src/tasks/LocalWorkflowTask/workflowHistory.ts',
])
const excluded = [
  'src/skills/bundled/',
  'src/plugins/bundled/',
]
const sourceFiles = []

function walk(folder) {
  for (const item of readdirSync(resolve(ROOT, folder), { withFileTypes: true })) {
    const child = join(folder, item.name).replaceAll('\\', '/')
    if (excluded.some(prefix => child === prefix.slice(0, -1) || child.startsWith(prefix))) continue
    if (item.isDirectory()) walk(child)
    else if (item.isFile() && /\\.tsx?$/.test(child) && !/\\.d\\.ts$/.test(child)) sourceFiles.push(child)
  }
}
walk('src')
walk('native')

function exported(node) {
  return node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false
}
function inspect(path) {
  const code = readFileSync(resolve(ROOT, path), 'utf8')
  const ast = ts.createSourceFile(path, code, ts.ScriptTarget.Latest, true,
    path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  if (ast.parseDiagnostics.length) {
    throw new Error(path + ': TypeScript parse error: ' +
      ts.flattenDiagnosticMessageText(ast.parseDiagnostics[0].messageText, '\\n'))
  }
  const missing = []
  let exportedFunctions = 0
  let typedSyntax = 0
  const addSignature = (node, name) => {
    exportedFunctions++
    const params = node.parameters ?? []
    for (const param of params) {
      if (param.type) continue
      const line = ast.getLineAndCharacterOfPosition(param.getStart(ast)).line + 1
      missing.push({ line, function: name, problem: 'parameter', name: param.name.getText(ast) })
    }
    if (!node.type) {
      const line = ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1
      missing.push({ line, function: name, problem: 'return' })
    }
  }
  const visit = node => {
    if (node.type && (ts.isParameter(node) || ts.isVariableDeclaration(node) ||
      ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node) || ts.isPropertyDeclaration(node))) typedSyntax++
    if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) ||
      ts.isTypeAssertionExpression(node) || ts.isAsExpression(node) ||
      (ts.isImportDeclaration(node) && node.importClause?.isTypeOnly)) typedSyntax++
    if (ts.isFunctionDeclaration(node) && node.body && exported(node))
      addSignature(node, node.name?.text ?? '<default>')
    if (ts.isVariableStatement(node) && exported(node)) {
      for (const declaration of node.declarationList.declarations) {
        const value = declaration.initializer
        if (value && (ts.isArrowFunction(value) || ts.isFunctionExpression(value))) {
          const name = declaration.name.getText(ast)
          if (declaration.type) {
            exportedFunctions++
            continue
          }
          addSignature(value, name)
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  return { path, lines: ast.getLineAndCharacterOfPosition(ast.end).line + 1,
    exportedFunctions, missing, typedSyntax,
    jsLike: typedSyntax === 0 && path.endsWith('.ts') }
}
const details = sourceFiles.sort().map(inspect)
const violations = details.filter(item => strictModules.has(item.path) && item.missing.length)
const missingModules = [...strictModules].filter(path => !sourceFiles.includes(path))
const ranked = [...details].filter(item => item.missing.length)
  .sort((a, b) => b.missing.length - a.missing.length || a.path.localeCompare(b.path))
const report = {
  revision: process.env.GITHUB_SHA ?? null,
  inspected: details.length,
  jsLikeFiles: details.filter(item => item.jsLike).length,
  exportedFunctions: details.reduce((n, item) => n + item.exportedFunctions, 0),
  untypedSignatures: details.reduce((n, item) => n + item.missing.length, 0),
  strictModules: [...strictModules].sort(),
  violations,
  missingModules,
  ranked,
  files: details,
}
const output = resolve(ROOT, '.rebuild/governance/type-migration-report.json')
mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, JSON.stringify(report, null, 2) + '\\n')
console.log('[TypeScript 迁移审计]', JSON.stringify({
  inspected: report.inspected,
  jsLikeFiles: report.jsLikeFiles,
  exportedFunctions: report.exportedFunctions,
  untypedSignatures: report.untypedSignatures,
  strictModules: strictModules.size,
  violations: violations.length,
  top: ranked.slice(0, 12).map(item => ({ path: item.path, missing: item.missing.length })),
}))
if (missingModules.length || violations.length) {
  for (const path of missingModules) console.error('Missing strict module: ' + path)
  for (const item of violations) {
    for (const issue of item.missing) {
      console.error(item.path + ':' + issue.line + ': untyped exported ' +
        issue.function + ' ' + issue.problem + (issue.name ? ' ' + issue.name : ''))
    }
  }
  process.exitCode = 1
}
