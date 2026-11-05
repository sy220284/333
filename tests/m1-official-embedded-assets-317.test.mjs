import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyOfficialEmbeddedAssets317 } from '../build/verify-official-embedded-assets.mjs'
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const catalog='build/official-embedded-assets-2.1.317.json'
const releaseSha='eb224419e344575faa4a1f39b290b649425a10cd5ee2ef1d003480cd9ae57eb0'
function fixture(testCase) {
 const root=mkdtempSync(join(tmpdir(),'verified-317-'))
 try {
  mkdirSync(join(root,'build'))
  writeFileSync(join(root,'package.json'),'{"version":"2.1.317"}')
  const resources=[]
  for(let i=0;i<101;i++){
    const path='src/skills/bundled/fixture/file-'+String(i).padStart(3,'0')+'.txt'
    mkdirSync(dirname(join(root,path)),{recursive:true})
    const bytes=Buffer.from('original-'+i)
    writeFileSync(join(root,path),bytes)
    resources.push({path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')})
  }
  const manifest={version:'2.1.317',source_binary_sha256:releaseSha,resources}
  writeFileSync(join(root,catalog),JSON.stringify(manifest))
  testCase(root,manifest)
 } finally {rmSync(root,{recursive:true,force:true})}
}
test('317 original embedded resources: 101 verified source files',()=>{
 const result=verifyOfficialEmbeddedAssets317(ROOT)
 assert.equal(result.resourceCount,101)
 assert.ok(result.bytes>0)
})
test('317 normalized scripts retain exact upstream source provenance',()=>{
 const manifest=JSON.parse(readFileSync(join(ROOT,catalog),'utf8'))
 const normalized=manifest.resources.filter(x=>x.upstream_backup)
 assert.equal(normalized.length,2)
 for (const record of normalized) {
  assert.equal(createHash('sha256').update(readFileSync(join(ROOT,record.upstream_backup))).digest('hex'),record.upstream_sha256)
 }
})
test('317 original embedded resources: valid manifest passes',()=>{
 fixture(root=>assert.equal(verifyOfficialEmbeddedAssets317(root).verified,true))
})
test('317 original embedded resources: corrupted byte is rejected',()=>{
 fixture((root,m)=>{
  writeFileSync(join(root,m.resources[0].path),'bad')
  assert.throws(()=>verifyOfficialEmbeddedAssets317(root),/bytes differ/)
 })
})
test('317 original embedded resources: missing/duplicated manifest entries rejected',()=>{
 fixture((root,m)=>{
  m.resources.pop()
  writeFileSync(join(root,catalog),JSON.stringify(m))
  assert.throws(()=>verifyOfficialEmbeddedAssets317(root),/invalid or incomplete/)
 })
 fixture((root,m)=>{
  m.resources[1].path=m.resources[0].path
  writeFileSync(join(root,catalog),JSON.stringify(m))
  assert.throws(()=>verifyOfficialEmbeddedAssets317(root),/Invalid, unordered or repeated/)
 })
})
test('317 original embedded resources: symbolic link refused',{
 skip:process.platform==='win32'?'Symlink privileges vary on Windows':false,
},()=>{
 fixture((root,m)=>{
  const target=join(root,m.resources[0].path)
  rmSync(target)
  symlinkSync(join(root,catalog),target)
  assert.throws(()=>verifyOfficialEmbeddedAssets317(root),/regular file/)
 })
})
