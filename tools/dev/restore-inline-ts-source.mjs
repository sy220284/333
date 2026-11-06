#!/usr/bin/env node
import { loadAstParser } from './ast-parser.mjs'
/**
 * Recover fully typed TS/TSX originals embedded in compiler-produced inline
 * source maps. Only exact single-file source maps with a measurable reduction
 * of missing exported type signatures are eligible.
 *
 * Default: preview and emit an auditable report.
 * --apply: write the verified original source. --limit=N controls batch size.
 *
 * This restores source code, NOT type-assertion patches on compiled output.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, relative, basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ts = await loadAstParser()
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const apply = process.argv.includes('--apply')
const maxArg = process.argv.find(arg => arg.startsWith('--limit='))
const limit = maxArg ? Number(maxArg.slice('--limit='.length)) : Infinity
if ((!Number.isInteger(limit) && limit !== Infinity) || limit < 1) throw new Error('Invalid --limit')
const paths = []
function walk(rel) {
  for (const entry of readdirSync(resolve(root, rel), { withFileTypes: true })) {
    const p = join(rel, entry.name).replaceAll('\\', '/')
    if (entry.isDirectory()) {
      if (p.startsWith('src/skills/bundled') || p.startsWith('src/plugins/bundled')) continue
      walk(p)
    } else if (entry.isFile() && /\.tsx?$/.test(p) && !p.endsWith('.d.ts')) paths.push(p)
  }
}
walk('src')
walk('native')
const exported = node => node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false
function scan(path, code) {
  const ast = ts.createSourceFile(path, code, ts.ScriptTarget.Latest, true,
    path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  if (ast.parseDiagnostics.length) return null
  let missing = 0
  let typeSyntax = 0
  let exportedCount = 0
  const signature = node => {
    exportedCount++
    for (const param of node.parameters ?? []) if (!param.type) missing++
    if (!node.type) missing++
  }
  function visit(node) {
    if (node.type && (ts.isParameter(node) || ts.isVariableDeclaration(node) ||
      ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) ||
      ts.isFunctionExpression(node) || ts.isMethodDeclaration(node) ||
      ts.isPropertyDeclaration(node))) typeSyntax++
    if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) ||
      ts.isTypeAssertionExpression(node) || ts.isAsExpression(node) ||
      (ts.isImportDeclaration(node) && node.importClause?.isTypeOnly) ||
      (ts.isExportDeclaration(node) && node.isTypeOnly)) typeSyntax++
    if (ts.isFunctionDeclaration(node) && node.body && exported(node)) signature(node)
    if (ts.isVariableStatement(node) && exported(node)) {
      for (const dec of node.declarationList.declarations) {
        const value = dec.initializer
        if (value && (ts.isArrowFunction(value) || ts.isFunctionExpression(value))) {
          if (dec.type) exportedCount++
          else signature(value)
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  return { missing, typeSyntax, exportedCount }
}
const INLINE = /(?:\/\/[#@]\s*sourceMappingURL=data:application\/json(?:;charset=utf-8)?;base64,)([A-Za-z0-9+/=]+)\s*$/
const results = [], rejected = []
for (const path of paths) {
  const text = readFileSync(resolve(root, path), 'utf8')
  const match = text.match(INLINE)
  if (!match) continue
  let obj, original
  try {
    obj = JSON.parse(Buffer.from(match[1], 'base64').toString('utf8'))
    if (obj.sources?.length !== 1 || obj.sourcesContent?.length !== 1) continue
    if (basename(obj.sources[0]) !== basename(path)) continue
    original = obj.sourcesContent[0]
    if (typeof original !== 'string' || !original.trim()) continue
    if (original.includes('sourceMappingURL=data:')) continue
    const before = scan(path, text), after = scan(path, original)
    if (!before || !after) { rejected.push({path,reason:'parser diagnostics'}); continue }
    if (after.missing >= before.missing && (before.typeSyntax !== 0 || after.typeSyntax === 0)) continue
    if (after.missing > before.missing) { rejected.push({path,reason:'signature regression'}); continue }
    if (after.exportedCount !== before.exportedCount) {
      rejected.push({path,reason:'changed exported function count'}); continue
    }
    if (after.typeSyntax < before.typeSyntax) {
      rejected.push({path,reason:'lost typed declarations'}); continue
    }
    results.push({path, currentBytes:text.length, restoredBytes:original.length,
      beforeMissing:before.missing, afterMissing:after.missing, 
      recovered:before.missing-after.missing, typeSyntax:after.typeSyntax, source:original})
  } catch (err) { rejected.push({path,reason:String(err)}) }
}
results.sort((a,b)=>b.recovered-a.recovered||a.path.localeCompare(b.path))
const chosen=results.slice(0,limit)
const report = {
  revision: process.env.GITHUB_SHA || null,
  candidates: results.length,
  recoveredPotential: results.reduce((n,x)=>n+x.recovered,0),
  selected:chosen.length,
  recoveredSelected: chosen.reduce((n,x)=>n+x.recovered,0),
  rejected, 
  files:results.map(({source,...summary})=>summary)
}
const out=resolve(root,'.rebuild/governance/inline-ts-source-recovery.json')
mkdirSync(dirname(out),{recursive:true})
writeFileSync(out,JSON.stringify(report,null,2)+'\n')
if (apply) for (const row of chosen) {
  const final = row.source.endsWith('\n') ? row.source : row.source+'\n'
  writeFileSync(resolve(root,row.path),final)
}
console.log('[原始TS/TSX恢复]',JSON.stringify({
  mode:apply?'apply':'preview',candidates:report.candidates,
  recoveredPotential:report.recoveredPotential,
  selected:report.selected,recoveredSelected:report.recoveredSelected,
  rejected:rejected.length,top:chosen.slice(0,25).map(({path,recovered})=>({path,recovered}))
}))
