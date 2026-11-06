#!/usr/bin/env node
/**
 * 2.1.317 TypeScript migration: merge proven .d.mts public contracts into
 * the actual TypeScript implementations. Runtime bodies stay unchanged.
 *
 * Usage:
 *   node tools/upgrade/rewrite-317-types.mjs --apply
 *   node tools/upgrade/rewrite-317-types.mjs --check
 */
import { loadAstParser } from '../dev/ast-parser.mjs'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const root = resolve(process.cwd())
const ts = await loadAstParser()
const apply = process.argv.includes('--apply')
const check = process.argv.includes('--check')
const declarations = []
function walk(folder) {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name)
    if (entry.isDirectory()) walk(path)
    else if (entry.name.endsWith('.d.mts')) declarations.push(path)
  }
}
walk(join(root, 'src'))
const changes = []
const diagnostics = []
for (const dPath of declarations.sort()) {
  const path = dPath.replace(/\.d\.mts$/, '.ts')
  if (!existsSync(path)) {
    diagnostics.push('Missing canonical implementation: ' + relative(root, path))
    continue
  }
  const before = readFileSync(path, 'utf8')
  const body = ts.createSourceFile(path, before, ts.ScriptTarget.ES2023, true, ts.ScriptKind.TS)
  const decl = ts.createSourceFile(dPath, readFileSync(dPath, 'utf8'), ts.ScriptTarget.ES2023, true, ts.ScriptKind.TS)
  const implementations = new Map(body.statements.filter(ts.isFunctionDeclaration)
    .filter(f => f.name).map(f => [f.name.text, f]))
  const runtimeConstants = new Map(body.statements.filter(ts.isVariableStatement)
    .flatMap(s => s.declarationList.declarations).map(d => [d.name.getText(body), d]))
  const ownTypes = new Set(body.statements.filter(s =>
    ts.isTypeAliasDeclaration(s) || ts.isInterfaceDeclaration(s)).map(s => s.name.text))
  const ownImports = body.statements.filter(ts.isImportDeclaration).map(s => s.getText(body)).join('\n')
  const insertions = []
  const issues = []
  function insert(pos, value) { insertions.push({ pos, value }) }
  for (const signature of decl.statements.filter(ts.isFunctionDeclaration)) {
    const name = signature.name?.text
    if (!name) continue
    const fn = implementations.get(name)
    if (!fn) { issues.push('Missing implementation for ' + name); continue }
    if (fn.parameters.length !== signature.parameters.length) {
      issues.push('Parameter count mismatch in ' + name + ' (runtime ' +
        fn.parameters.length + ', declaration ' + signature.parameters.length + ')')
      continue
    }
    if (!fn.typeParameters?.length && signature.typeParameters?.length) {
      insert(fn.name.end, '<' + signature.typeParameters.map(p => p.getText(decl)).join(', ') + '>')
    }
    for (let i = 0; i < fn.parameters.length; i++) {
      const param = fn.parameters[i]
      const contract = signature.parameters[i]
      if (!param.type && contract.type) {
        insert(param.questionToken?.end ?? param.name.end, ': ' + contract.type.getText(decl))
      }
    }
    if (!fn.type && signature.type) {
      insert(fn.body.getStart(body), ': ' + signature.type.getText(decl) + ' ')
    }
  }
  for (const declaration of decl.statements.filter(ts.isVariableStatement)
    .flatMap(s => s.declarationList.declarations)) {
    const target = runtimeConstants.get(declaration.name.getText(decl))
    if (target && !target.type && declaration.type) {
      insert(target.name.end, ': ' + declaration.type.getText(decl))
    }
  }
  if (insertions.length) {
    const types = []
    for (const statement of decl.statements) {
      if ((ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) &&
          !ownTypes.has(statement.name.text)) types.push(statement.getText(decl))
      if (ts.isImportDeclaration(statement) && !ownImports.includes(statement.getText(decl))) {
        const named = statement.importClause?.namedBindings
        const symbols = named && ts.isNamedImports(named) ? named.elements.map(e => e.name.text) : []
        if (!symbols.some(s => new RegExp('\\b' + s + '\\b').test(ownImports))) {
          types.unshift(statement.getText(decl))
        }
      }
    }
    if (types.length) insert(0, types.join('\n') + '\n\n')
  }
  let after = before
  insertions.sort((a, b) => b.pos - a.pos)
  for (const item of insertions) {
    after = after.slice(0, item.pos) + item.value + after.slice(item.pos)
  }
  const result = ts.createSourceFile(path, after, ts.ScriptTarget.ES2023, true, ts.ScriptKind.TS)
  for (const diagnostic of result.parseDiagnostics) {
    issues.push(ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '))
  }
  if (issues.length) diagnostics.push(relative(root, path) + ': ' + issues.join('; '))
  if (after !== before) {
    changes.push({ path: relative(root, path), edits: insertions.length })
    if (apply && issues.length === 0) writeFileSync(path, after)
  }
}
console.log(JSON.stringify({
  mode: apply ? 'apply' : check ? 'check' : 'preview',
  reviewed: declarations.length,
  changed: changes.length,
  changes,
  diagnostics,
}, null, 2))
if (diagnostics.length || (check && changes.length)) process.exitCode = 1
