#!/usr/bin/env node
/** Add compiler-inferred stable public constant declarations to JS-like TS sources. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url), ts = require('typescript')
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const rp = process.env.TS_MIGRATION_REPORT ?? '.rebuild/governance/type-migration-report.json'
const report = JSON.parse(readFileSync(resolve(root,rp),'utf8'))
const cfg = resolve(root,'.rebuild/tsconfig.dev.json')
const file = ts.sys.fileExists(cfg) ? cfg : resolve(root,'tsconfig.json')
const raw = ts.readConfigFile(file,ts.sys.readFile)
if(raw.error) throw Error(ts.flattenDiagnosticMessageText(raw.error.messageText,'\n'))
const parsed = ts.parseJsonConfigFileContent(raw.config,ts.sys,dirname(file))
const program = ts.createProgram(parsed.fileNames,{...parsed.options,noEmit:true})
const checker = program.getTypeChecker(),out=resolve(root,'.rebuild/constant-proposals')
const stats={files:0,changed:0,skipped:0,syntaxFailures:0},details=[]
const safe=s=>s&&s.length<500&&!/\b(?:any|unknown)\b/.test(s)&&!/[\r\n]/.test(s)
for(const item of report.files.filter(f=>f.jsLike)){
  const path=item.path,sf=program.getSourceFile(resolve(root,path))
  if(!sf)continue
  stats.files++
  const source=readFileSync(resolve(root,path),'utf8')
  const declarations=[]
  for(const stmt of sf.statements){
    if(!ts.isVariableStatement(stmt))continue
    const isExport=stmt.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)
    for(const decl of stmt.declarationList.declarations){
      if(!ts.isIdentifier(decl.name)||decl.type||!decl.initializer||
        ts.isArrowFunction(decl.initializer)||ts.isFunctionExpression(decl.initializer))continue
      const ty=checker.getTypeAtLocation(decl.name)
      const inferred=checker.typeToString(ty,decl,ts.TypeFormatFlags.NoTruncation|
        ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope)
      if(safe(inferred))declarations.push({decl,type:inferred,exported:Boolean(isExport),name:decl.name.text})
    }
  }
  declarations.sort((a,b)=>Number(b.exported)-Number(a.exported)||a.type.length-b.type.length)
  const selected=declarations[0]
  if(!selected){stats.skipped++;continue}
  const pos=selected.decl.name.getEnd()
  const code=source.slice(0,pos)+': '+selected.type+source.slice(pos)
  const syntactic=ts.createSourceFile(path,code,ts.ScriptTarget.Latest,true,
    path.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS)
  if(syntactic.parseDiagnostics.length){stats.syntaxFailures++;continue}
  const dest=join(out,path);mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,code)
  stats.changed++;details.push({path,name:selected.name,type:selected.type})
}
mkdirSync(out,{recursive:true})
writeFileSync(join(out,'proposal-report.json'),JSON.stringify({stats,details},null,2))
console.log('[TypeScript constant signatures]',JSON.stringify(stats))
if(stats.syntaxFailures)process.exitCode=1
