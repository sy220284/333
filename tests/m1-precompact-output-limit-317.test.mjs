import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { capPreCompactHookOutput, MAX_PRECOMPACT_HOOK_OUTPUT } from '../src/utils/hooks/preCompactOutput.mjs'

test('2.1.314/317 PreCompact preserves ordinary output and exactly 10000 chars', () => {
  assert.equal(MAX_PRECOMPACT_HOOK_OUTPUT,10000)
  for(const text of ['', 'simple instruction', 'a'.repeat(9999), 'b'.repeat(10000)]) {
    const result=capPreCompactHookOutput(text,'fixture')
    assert.equal(result.output,text)
    assert.equal(result.truncated,false)
    assert.equal(result.originalLength,text.length)
  }
  assert.equal(capPreCompactHookOutput('  text \n','fixture').output,'text')
})
test('each overlong successful hook is shortened independently and explains truncation', () => {
  const command='save-context'
  const large='a'.repeat(10047)
  const shortened=capPreCompactHookOutput(large,command)
  assert.equal(shortened.truncated,true)
  assert.equal(shortened.originalLength,large.length)
  assert.ok(shortened.output.startsWith('a'.repeat(10000)+'\n\n[PreCompact hook [save-context] output cut: 10047 characters is over the 10000-character limit]'))
  assert.equal(shortened.output.includes('a'.repeat(10001)),false)
  assert.equal(capPreCompactHookOutput('ok','other').output,'ok')
})
test('truncate surrogate pairs without cutting one code point in half', () => {
  const big='x'.repeat(9999)+'😀'+'z'.repeat(30)
  const output=capPreCompactHookOutput(big,'unicode').output
  assert.equal(output.startsWith('x'.repeat(9999)+'😀'),false)
  assert.ok(output.startsWith('x'.repeat(9999)+'\n\n'))
  assert.ok(!output.includes('\ufffd'),'split surrogate corrupted')
  assert.ok(output.includes('10031 characters is over the 10000-character limit'))
})
test('the real hook consumer calls cap before incorporating successful output into compaction', () => {
  const source=readFileSync(new URL('../src/utils/hooks.ts',import.meta.url),'utf8')
  const at=source.slice(source.indexOf('export async function executePreCompactHooks('))
  const end=at.indexOf('export async function executePostCompactHooks(')
  const block=at.slice(0,end)
  assert.match(block,/capPreCompactHookOutput\(result\.output, result\.command\)/)
  assert.match(block,/result\.succeeded && !result\.blocked/)
  assert.ok(block.indexOf('capPreCompactHookOutput(')<block.indexOf('successfulOutputs.push(capped.output)'))
  assert.match(block,/newCustomInstructions:[\s\S]*successfulOutputs\.join/)
})
