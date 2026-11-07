import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8')
const main=readFileSync(new URL('../src/main.tsx',import.meta.url),'utf8')
const css=readFileSync(new URL('../src/cc-haha-theme.css',import.meta.url),'utf8')

test('新桌面 UI 保留真实会话/工作区入口，不恢复旧仪表盘宣传界面',()=>{
  for(const marker of ['cc-workspace-shell','cc-sidebar','cc-tabs','cc-welcome','sessions.list','sessions.ensureOpen','missions.jobs.runQueue','permissions.decide']){
    assert.ok(app.includes(marker),`缺少真实功能或界面入口：${marker}`)
  }
  assert.equal(app.includes('GOOD TO SEE YOU AGAIN'),false)
  assert.ok(main.includes("import './cc-haha-theme.css'"))
})
test('六套界面主题和旧偏好同时可用',()=>{
  for(const theme of ['white','paper','warm-classic','celadon','dark','ink-blue']){
    assert.ok(css.includes(`[data-cc-theme=${theme}]`),`缺少主题：${theme}`)
    assert.ok(app.includes(`'${theme}'`),`缺少主题状态：${theme}`)
  }
  assert.ok(app.includes("PREF+'dark'"))
  assert.ok(app.includes("PREF+'theme'"))
})
