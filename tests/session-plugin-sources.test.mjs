import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

test('session-only ZIP plugin materializes actual manifest, without installing globally', async () => {
  const { zipSync, strToU8 } = await import('fflate')
  const { prepareSessionPluginPaths } = await import('../src/utils/plugins/sessionPluginSources.ts')
  const dir = mkdtempSync(join(tmpdir(),'333-inline-test-'))
  try {
    const zip=zipSync({ 'sample/.claude-plugin/plugin.json':strToU8(JSON.stringify({name:'plugin-smoke',version:'1.0.0'})), 'sample/commands/hi.md':strToU8('hello') })
    const file=join(dir,'plugin.zip')
    writeFileSync(file,Buffer.from(zip))
    const paths=await prepareSessionPluginPaths([file],[])
    assert.equal(paths.length,1)
    assert.ok(existsSync(join(paths[0],'.claude-plugin','plugin.json')))
    assert.ok(existsSync(join(paths[0],'commands','hi.md')))
  } finally { rmSync(dir,{recursive:true,force:true}) }
})
test('archive path traversal and oversized archives are refused', async()=>{
 const {zipSync,strToU8}=await import('fflate')
 const {prepareSessionPluginPaths}=await import('../src/utils/plugins/sessionPluginSources.ts')
 const dir=mkdtempSync(join(tmpdir(),'333-inline-security-'))
 try{
  const file=join(dir,'unsafe.zip')
  writeFileSync(file,Buffer.from(zipSync({'../outside.txt':strToU8('bad')})))
  await assert.rejects(()=>prepareSessionPluginPaths([file],[]),/Unsafe|traversal/i)
 }finally{rmSync(dir,{recursive:true,force:true})}
})
