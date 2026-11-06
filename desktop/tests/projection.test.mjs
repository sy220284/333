import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const src=readFileSync(resolve(import.meta.dirname,'../src/projection.ts'),'utf8')
test('消息投影提供对话文本提取和状态显示函数',()=>{
  assert.match(src,/function textFromMessage/)
  assert.match(src,/function itemFromMessage/)
  assert.match(src,/requires_action:'等待确认'/)
})
test('主进程限制窗口权限与 IPC 请求',()=>{
  const main=readFileSync(resolve(import.meta.dirname,'../electron/main.ts'),'utf8')
  assert.match(main,/contextIsolation:true/)
  assert.match(main,/sandbox:true/)
  assert.match(main,/nodeIntegration:false/)
  assert.match(main,/permitted\.has\(method\)/)
  assert.match(main,/realpath\(active\)/)
  assert.match(main,/sessions\.setPermissionMode/)
})
test('页面包含真实会话、任务与审批接口',()=>{
  const app=readFileSync(resolve(import.meta.dirname,'../src/App.tsx'),'utf8')
  for(const method of ['sessions.open','sessions.send','sessions.interrupt','permissions.decide','missions.create','agents.setMode','models.list'])
    assert.ok(app.includes(method),'缺少 '+method)
})
