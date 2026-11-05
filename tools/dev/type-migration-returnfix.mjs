#!/usr/bin/env node
/**
 * Generate source-derived explicit return type annotations.
 * The inference engine makes no guessed type assertions or runtime changes.
 * Proposals are reviewed by a full TypeScript typecheck before any commit.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const ts = require('typescript')
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const report = JSON.parse(readFileSync(resolve(root, '.rebuild/governance/type-migration-report.json'), 'utf8'))
const configPath = resolve(root, '.rebuild/tsconfig.dev.json')
const selectedConfig = ts.sys.fileExists(configPath) ? configPath : resolve(root, 'tsconfig.json')
const read = ts.readConfigFile(selectedConfig, ts.sys.readFile)
if (read.error) throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, '\n'))
const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, dirname(selectedConfig))
const program = ts.createProgram(parsed.fileNames, { ...parsed.options, noEmit: true })
const checker = program.getTypeChecker()
const output = resolve(root, '.rebuild/migration-proposals')
const stats = {inspected:0,updatedFiles:0,addedReturns:0,skipped:0,syntaxFailures:0}
const details = []
function exported(node) {
  return node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)
}
for (const item of report.ranked) {
  const path = item.path, full = resolve(root, path)
  const ast = program.getSourceFile(full)
  if (!ast) continue
  stats.inspected++
  const code = readFileSync(full, 'utf8')
  const edits = [], skips = []
  function add(node, name) {
    if (node.type) return
    let type
    try {
      const signature = checker.getSignatureFromDeclaration(node)
      if (signature) type = checker.typeToString(
        checker.getReturnTypeOfSignature(signature), node,
        ts.TypeFormatFlags.NoTruncation |
        ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope)
    } catch (e) {
      skips.push({ name, reason: 'typechecker exception: ' + String(e) })
      return
    }
    if (!type || type.length > 500 || /\b(?:any|unknown)\b/.test(type) ||
        /[\r\n]/.test(type) || type === 'never') {
      skips.push({ name, reason: 'insufficiently precise inference: ' + String(type).slice(0, 75) })
      return
    }
    let pos
    if (ts.isArrowFunction(node)) {
      const arrow = node.equalsGreaterThanToken.getStart(ast)
      if (code.slice(node.parameters.end, arrow).trim() !== ')') {
        skips.push({ name, reason: 'bare arrow parameter' })
        return
      }
      pos = arrow
    } else if (node.body) {
      pos = node.body.getStart(ast)
    }
    if (pos === undefined) return
    edits.push({ pos, text: ': ' + type + ' ', name, type })
  }
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.body && exported(node))
      add(node, node.name?.text ?? 'default')
    if (ts.isVariableStatement(node) && exported(node))
      for (const decl of node.declarationList.declarations) {
        const init = decl.initializer
        if (!decl.type && init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init)))
          add(init, decl.name.getText(ast))
      }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  if (!edits.length) {
    stats.skipped += skips.length
    continue
  }
  let proposed = code
  for (const edit of edits.sort((a,b) => b.pos - a.pos))
    proposed = proposed.slice(0,edit.pos) + edit.text + proposed.slice(edit.pos)
  const parsedSource = ts.createSourceFile(path, proposed, ts.ScriptTarget.Latest, true,
    path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  if (parsedSource.parseDiagnostics.length) {
    stats.syntaxFailures++
    details.push({ path, syntaxError: parsedSource.parseDiagnostics.map(
      d => ts.flattenDiagnosticMessageText(d.messageText,'\n')) })
    continue
  }
  const file = resolve(output, path)
  mkdirSync(dirname(file), { recursive:true })
  writeFileSync(file, proposed)
  stats.updatedFiles++
  stats.addedReturns += edits.length
  stats.skipped += skips.length
  details.push({path, changes:edits.map(x=>({name:x.name,type:x.type})), skips})
}
mkdirSync(output,{recursive:true})
writeFileSync(join(output,'proposal-report.json'), JSON.stringify({stats,details}, null, 2))
console.log('[TypeScript return inference]',JSON.stringify(stats))
if (stats.syntaxFailures) process.exitCode=1
