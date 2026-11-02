import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFile} from 'node:fs/promises'
import {resolveScreenReaderMode,screenReaderChildEnvironment,flattenAccessibleTree,accessibleOutputDelta} from '../src/utils/accessibility/screenReaderMode.mjs'

const settings=[{settings:{axScreenReader:true}}]
test('explicit flag, env and trusted setting activation follow official precedence',()=>{
 assert.deepEqual(resolveScreenReaderMode({argv:['--ax-screen-reader'],env:{CLAUDE_AX_SCREEN_READER:'0'}}),{enabled:true,source:'flag'})
 assert.deepEqual(resolveScreenReaderMode({env:{CLAUDE_AX_SCREEN_READER:'false'},trustedSettings:settings}),{enabled:false,source:'env'})
 assert.deepEqual(resolveScreenReaderMode({env:{CLAUDE_AX_SCREEN_READER:'1'}}),{enabled:true,source:'env'})
 assert.deepEqual(resolveScreenReaderMode({trustedSettings:settings}),{enabled:true,source:'settings'})
 assert.deepEqual(resolveScreenReaderMode({}),{enabled:false})
 assert.deepEqual(screenReaderChildEnvironment({enabled:true}),{CLAUDE_AX_SCREEN_READER:'1'})
})
test('DOM text is flattened and decorative ANSI omitted',()=>{
 const tree={nodeName:'ink-root',childNodes:[
  {nodeName:'ink-box',childNodes:[{nodeName:'ink-text',childNodes:[{nodeName:'#text',nodeValue:'Tool output'}]}]},
  {nodeName:'ink-box',childNodes:[{nodeName:'ink-text',childNodes:[{nodeName:'#text',nodeValue:'Result: '},{nodeName:'#text',nodeValue:'done'}]}]},
  {nodeName:'ink-raw-ansi',childNodes:[{nodeName:'#text',nodeValue:'\\x1b[31m'}]},
 ]}
 assert.equal(flattenAccessibleTree(tree),'Tool output\nResult: done')
 assert.equal(accessibleOutputDelta('a\nb','a\nb'),'')
 assert.equal(accessibleOutputDelta('a\nb','a\nb\nc'),'\nc\n')
 assert.equal(accessibleOutputDelta('a\nb','a\nnew'),'new\n')
})
test('CLI, settings and actual Ink rendering are connected',async()=>{
 const source=path=>readFile(new URL('../'+path,import.meta.url),'utf8')
 const [cli,settings,ink,gate]=await Promise.all([
  source('src/main.tsx'),source('src/utils/settings/types.ts'),source('src/ink/ink.tsx'),source('src/utils/accessibility/screenReaderRuntime.ts')])
 assert.match(cli,/--ax-screen-reader/)
 assert.match(settings,/axScreenReader:\s*z\s*\.boolean\(\)/)
 assert.match(ink,/flattenAccessibleTree\(this\.rootNode\)/)
 assert.match(ink,/accessibleOutputDelta\(/)
 assert.match(gate,/getSettingsForSource\(/)
})
