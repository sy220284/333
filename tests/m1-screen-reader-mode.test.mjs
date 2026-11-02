import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFile} from 'node:fs/promises'
import {resolveScreenReaderMode,screenReaderChildEnvironment,flattenAccessibleTree,accessibleOutputDelta,createScreenReaderAnnouncementQueue} from '../src/utils/accessibility/screenReaderMode.mjs'

const settings=[{settings:{axScreenReader:true}}]
test('explicit flag, env and trusted setting activation follow official precedence',()=>{
 assert.deepEqual(resolveScreenReaderMode({argv:['--ax-screen-reader'],env:{CLAUDE_AX_SCREEN_READER:'0'}}),{enabled:true,source:'flag'})
 assert.deepEqual(resolveScreenReaderMode({env:{CLAUDE_AX_SCREEN_READER:''},trustedSettings:settings}),{enabled:false,source:'env'})
 assert.deepEqual(resolveScreenReaderMode({env:{CLAUDE_AX_SCREEN_READER:'0'},trustedSettings:settings}),{enabled:true,source:'env'})
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
test('logo model, billing and working directory remain separate spoken lines',()=>{
 const box={nodeName:'ink-box',childNodes:[
  {nodeName:'ink-text',childNodes:[
   {nodeName:'#text',nodeValue:'Claude Code '},
   {nodeName:'ink-text',childNodes:[{nodeName:'#text',nodeValue:'v2.1.310'}]},
  ]},
  {nodeName:'ink-text',childNodes:[{nodeName:'#text',nodeValue:'Sonnet 4.6 · API Usage Billing'}]},
  {nodeName:'ink-text',childNodes:[{nodeName:'#text',nodeValue:'~/project'}]},
 ]}
 assert.equal(flattenAccessibleTree({nodeName:'ink-root',childNodes:[box]}),
  'Claude Code v2.1.310\nSonnet 4.6 · API Usage Billing\n~/project')
})

test('virtual-text container splits semantic sibling labels but preserves inline styled spans',()=>{
 const label=text=>({nodeName:'ink-text',childNodes:[{nodeName:'#text',nodeValue:text}]})
 const tree={nodeName:'ink-root',childNodes:[{nodeName:'ink-virtual-text',childNodes:[
  {nodeName:'ink-text',childNodes:[label('Claude Code'),{nodeName:'#text',nodeValue:' v2.1.310'}]},
  label('Sonnet 4.6 · API Usage Billing'),
  label('~/project'),
 ]}]}
 assert.equal(flattenAccessibleTree(tree),
   'Claude Code v2.1.310\\nSonnet 4.6 · API Usage Billing\\n~/project')
})

test('CLI, settings and actual Ink rendering are connected',async()=>{
 const source=path=>readFile(new URL('../'+path,import.meta.url),'utf8')
 const [cli,settings,ink,gate]=await Promise.all([
  source('src/main.tsx'),source('src/utils/settings/types.ts'),source('src/ink/ink.tsx'),source('src/utils/accessibility/screenReaderRuntime.ts')])
 assert.match(cli,/--ax-screen-reader/)
 assert.match(settings,/axScreenReader:\s*z\s*\.boolean\(\)\s*\.optional\(\)/)
 assert.match(ink,/flattenAccessibleTree\(this\.rootNode\)/)
 assert.match(ink,/accessibleOutputDelta\(/)
 assert.match(ink,/this\.accessibleAnnouncements\.endStartupQuiet\(\)/)
 assert.match(ink,/import\s*\{[^}]*\bisScreenReaderEnabled\b[^}]*\}\s*from\s*['"]\.\.\/utils\/accessibility\/screenReaderRuntime\.js['"]\s*;/)
 assert.match(ink,/if\s*\(isScreenReaderEnabled\(\)\)\s*\{/)
 assert.match(ink,/clearTimeout\(this\.accessibleFlushTimer\)/)
 assert.match(ink,/this\.accessibleAnnouncements\.drain\(\)/)
 assert.ok(ink.includes('Screen Reader Mode: on via ${getScreenReaderActivationSource()}'))
 assert.match(gate,/startupActivationSource/)
 assert.match(gate,/startupActivationSource = mode\.source/)
 assert.match(gate,/getSettingsForSource\(/)
})

test('announcements are held at startup, bounded, and delivered exactly once',()=>{
 const pending=createScreenReaderAnnouncementQueue({quietMs:3000,holdMs:1000,max:2})
 pending.queue('first',{now:100})
 pending.queue('second',{now:100,hold:true})
 assert.equal(pending.pending(),2)
 assert.equal(pending.remaining(1100),2000)
 assert.deepEqual(pending.drain(2000),[])
 pending.queue('third',{now:2000})
 assert.deepEqual(pending.drain(3101),['second','third'])
 assert.deepEqual(pending.drain(3101),[])
 const early=createScreenReaderAnnouncementQueue()
 early.queue('ready',{now:20})
 early.endStartupQuiet()
 assert.deepEqual(early.drain(20),['ready'])
})
