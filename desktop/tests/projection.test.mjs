import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'

const source=readFileSync(resolve(import.meta.dirname,'../src/projection.ts'),'utf8')
const transpiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}})
const compiled='data:text/javascript;base64,'+Buffer.from(transpiled.outputText).toString('base64')
const {textFromMessage,itemFromMessage,statusName}=await import(compiled)

test('真实用户与助手消息提取',()=>{
  assert.equal(textFromMessage({message:{role:'assistant',content:[{type:'text',text:'第一段'},{type:'text',text:'第二段'}]}}),'第一段\n第二段')
  assert.equal(itemFromMessage({type:'assistant',uuid:'a',message:{role:'assistant',content:[{type:'text',text:'结果'}]}}).text,'结果')
  assert.equal(itemFromMessage({type:'user',message:{role:'user',content:'用户请求'}}).kind,'user')
  assert.equal(itemFromMessage({type:'unknown'}),null)
})
test('工具和等待确认状态可见',()=>{
  assert.equal(itemFromMessage({type:'tool_progress',tool_name:'Read'}).kind,'tool')
  assert.equal(statusName('requires_action'),'等待确认')
  assert.equal(statusName('failed'),'执行失败')
})
test('Electron 入口限制 IPC 与危险授权',()=>{
  const main=readFileSync(resolve(import.meta.dirname,'../electron/main.ts'),'utf8')
  for(const pattern of [/contextIsolation:true/,/sandbox:true/,/nodeIntegration:false/,/permitted\.has\(method\)/,/realpath\(active\)/,/sessions\.setPermissionMode/,/用户取消授权模式修改/])
    assert.match(main,pattern)
})
test('桌面九类入口已连接实际后台请求',()=>{
  const app=readFileSync(resolve(import.meta.dirname,'../src/App.tsx'),'utf8')
  for(const method of ['sessions.open','sessions.send','sessions.interrupt','permissions.decide','missions.create','agents.setMode','models.list','workspace.list','workspace.read','workspace.gitStatus','missions.jobs.runBatch','missions.jobs.approve'])
    assert.ok(app.includes(method),'缺少 '+method)
})
