import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
const src=relative=>readFileSync(new URL(relative,import.meta.url),'utf8')
test('桌面使用原生UI的新页面并不存在旧UI回退入口',()=>{
  const app=src('../src/App.tsx'),layout=src('../src/theme/yaoyao-layout.css')
  for(const route of ['dashboard','chat','agents','missions','files','models','integrations','github','history','settings'])assert.ok(app.includes("view==='"+route+"'"),route+' 缺失')
  for(const legacy of ['cc-workspace-shell','cc-sidebar','cc-home-page','className="chat-page"','className="stack-page"','className="mission-page"','className="files-page"','className="model-grid"','className="integration-grid"'])assert.equal(app.includes(legacy),false,'仍使用旧界面结构 '+legacy)
  assert.equal(existsSync(new URL('../src/styles.css',import.meta.url)),false)
  assert.equal(existsSync(new URL('../src/cc-haha-theme.css',import.meta.url)),false)
  assert.ok(app.includes('NewSessionStarter'))
  assert.ok(app.includes('SessionChatSurface'))
  assert.ok(layout.includes('.yy-nav-link'))
  assert.ok(layout.includes('.yy-tab'))
})
test('新 UI 业务入口对应实际回调，重要危险操作仍保留确认',()=>{
  const app=src('../src/App.tsx')
  for(const name of ['sessions.open','sessions.send','sessions.interrupt','sessions.setModel','agents.setMode','missions.jobs.runQueue','missions.jobs.approve','workspace.read','workspace.write','mcp.toggle','mcp.remove','host.reject'])assert.ok(app.includes(name),'缺少 '+name)
  assert.ok(app.includes('window.confirm'))
  assert.ok(app.includes('onSuggestion={toChat}'))
})
