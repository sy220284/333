#!/usr/bin/env node
import { loadAstParser } from './ast-parser.mjs'
/**
 * Infer exported parameter types from real call and usage sites using the
 * TypeScript language service. Leave broad or unavailable types unresolved.
 * Produces proposals only: CI validates all candidate source before publishing.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const ts = await loadAstParser()
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const report = JSON.parse(readFileSync(resolve(root,'.rebuild/governance/type-migration-report.json'),'utf8'))
const localConfig = resolve(root,'.rebuild/tsconfig.dev.json')
const configPath = ts.sys.fileExists(localConfig) ? localConfig : resolve(root,'tsconfig.json')
const raw = ts.readConfigFile(configPath, ts.sys.readFile)
if (raw.error) throw new Error(ts.flattenDiagnosticMessageText(raw.error.messageText, '\n'))
const cfg = ts.parseJsonConfigFileContent(raw.config, ts.sys, dirname(configPath))
const options = {...cfg.options,strict:true,noImplicitAny:true,noEmit:true}
const files = cfg.fileNames
const host = {
  getScriptFileNames: () => files, getScriptVersion: () => '0',
  getScriptSnapshot: path => ts.sys.fileExists(path)
    ? ts.ScriptSnapshot.fromString(ts.sys.readFile(path)) : undefined,
  getCurrentDirectory: () => root, getCompilationSettings: () => options,
  getDefaultLibFileName: opts => ts.getDefaultLibFilePath(opts),
  fileExists:ts.sys.fileExists,readFile:ts.sys.readFile,readDirectory:ts.sys.readDirectory,
}
const service = ts.createLanguageService(host, ts.createDocumentRegistry())
const program = service.getProgram()
if (!program) throw new Error('Unable to initialize TypeScript program')
const output = resolve(root,'.rebuild/parameter-proposals')
const stats = {files:0,changed:0,acceptedParameters:0,skipped:0,syntaxFailures:0}
const details = []
function exported(node) {
  return node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)
}
for (const item of report.ranked) {
  const path = item.path, full = resolve(root,path)
  const sf = program.getSourceFile(full)
  if (!sf) continue
  const source = readFileSync(full,'utf8')
  stats.files++
  const params = []
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.body && exported(node))
      params.push(...node.parameters.filter(p => !p.type))
    if (ts.isVariableStatement(node) && exported(node))
      for (const declaration of node.declarationList.declarations) {
        const fn = declaration.initializer
        if (fn && (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) && !declaration.type)
          params.push(...fn.parameters.filter(p => !p.type))
      }
    ts.forEachChild(node,visit)
  }
  visit(sf)
  if (!params.length) continue
  const response = service.getCombinedCodeFix({type:'file',fileName:full},'inferFromUsage',{}, {})
  const offered = response.changes.flatMap(change =>
    change.fileName === full ? change.textChanges : [])
  const edits = [], reasons = []
  for (const param of params) {
    const start=param.name.getStart(sf),end=param.name.getEnd()
    const matches=offered.filter(edit =>
      edit.span.start>=start-2 && edit.span.start<=end+2 &&
      edit.span.start+edit.span.length<=end+2)
    const annotations=matches.filter(edit => edit.newText.startsWith(': '))
    if (!annotations.length) {
      stats.skipped++
      reasons.push({parameter:param.name.getText(sf),reason:'no derived parameter type'})
      continue
    }
    if (annotations.some(edit => /\b(?:any|unknown)\b/.test(edit.newText) ||
        /:\s*(?:\{\}|object|undefined|null|never)\b/.test(edit.newText) || edit.newText.length>450)) {
      stats.skipped++
      reasons.push({parameter:param.name.getText(sf),reason:'inferred type too broad'})
      continue
    }
    for (const edit of matches)
      if (edit.newText==='('||edit.newText===')'||edit.newText.startsWith(': '))
        edits.push(edit)
    stats.acceptedParameters++
  }
  const unique=new Map()
  for (const edit of edits)
    unique.set(edit.span.start+'|'+edit.span.length+'|'+edit.newText, edit)
  const changes=[...unique.values()]
  if (!changes.length) continue
  changes.sort((a,b) => b.span.start-a.span.start || b.span.length-a.span.length)
  let code=source
  for (const edit of changes)
    code=code.slice(0,edit.span.start)+edit.newText+
      code.slice(edit.span.start+edit.span.length)
  const ast=ts.createSourceFile(path,code,ts.ScriptTarget.Latest,true,
    path.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS)
  if (ast.parseDiagnostics.length) {
    stats.syntaxFailures++
    reasons.push({reason:'syntax failure',errors:ast.parseDiagnostics.map(e=>
      ts.flattenDiagnosticMessageText(e.messageText,'\n'))})
    continue
  }
  const destination=join(output,path)
  mkdirSync(dirname(destination),{recursive:true})
  writeFileSync(destination,code)
  stats.changed++
  details.push({path,fixes:changes.length,reasons})
}
mkdirSync(output,{recursive:true})
writeFileSync(join(output,'proposal-report.json'),JSON.stringify({stats,details},null,2))
console.log('[TypeScript inferred parameters]',JSON.stringify(stats))
if (stats.syntaxFailures) process.exitCode=1
