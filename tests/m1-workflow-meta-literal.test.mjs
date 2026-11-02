import {test} from 'node:test'
import assert from 'node:assert/strict'
import {parseWorkflowMetaLiteral} from '../src/tools/WorkflowTool/workflowMetaParser.mjs'

test('workflow metadata accepts a plain nested literal and strict hex/unicode escapes',()=>{
 const literal=String.raw`{name:"Review\\u0041",description:'Safe',phases:[{title:"A\\x42",detail:'Step'}],enabled:true,count:3}`
 const meta=parseWorkflowMetaLiteral(literal)
 assert.equal(meta.name,'ReviewA')
 assert.equal(meta.phases[0].title,'AB')
 assert.equal(meta.count,3)
 assert.equal(meta.enabled,true)
})
test('workflow metadata fails on broken hex and unicode escape sequences',()=>{
 for(const input of [
  String.raw`{name:"x\\u00GG"}`,
  String.raw`{name:"x\\x0Q"}`,
  String.raw`{name:"x\\u123"}`,
  String.raw`{name:"x\\x1"}`,
 ]){
  assert.throws(()=>parseWorkflowMetaLiteral(input),/static literal/)
 }
})
test('workflow metadata is inert: expressions, getters and prototype keys cannot execute',()=>{
 for(const source of [
  "{name:process.env.SECRET}",
  "{name:(()=>{throw Error('side effect')})()}",
  "{name:'safe',name:'duplicate'}",
  "{__proto__:{polluted:true}}",
  "{constructor:'evil'}",
  "{name:'safe',getter(){return 1}}",
 ]){
  assert.throws(()=>parseWorkflowMetaLiteral(source),/static literal/)
 }
})
test('workflow metadata does not accept oversized or malformed structures',()=>{
 assert.throws(()=>parseWorkflowMetaLiteral('{name:'+ 'x'.repeat(65536)+'}'),/too large/)
 assert.throws(()=>parseWorkflowMetaLiteral('{name:[1,2]'),/static literal/)
})
