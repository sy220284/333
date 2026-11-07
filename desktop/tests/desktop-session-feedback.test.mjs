import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const get=path=>readFileSync(new URL(path,import.meta.url),'utf8')
const app=get('../src/App.tsx')
const surface=get('../src/components/chat/SessionChatSurface.tsx')
const gateway=get('../../src/services/desktop/gateway.ts')
test('新桌面以真实模型流生成助手文本，保留会话与任务状态',()=>{
  assert.match(app,/streaming\.type==='content_block_delta'/)
  assert.match(app,/delta\.type==='text_delta'/)
  assert.match(app,/setSessionPhase/)
  assert.match(app,/sessions\.history/)
  assert.match(gateway,/sessions\.ensureOpen/)
})
test('新桌面直接呈现执行、审批、完成、错误状态',()=>{
  for(const expected of ["running:'执行中'","requires_action:'等待确认'","completed:'已完成'","cancelled:'已取消'","failed:'执行失败'"]){
    assert.ok(surface.includes(expected),expected)
  }
  assert.match(surface,/aria-live="polite"/)
  assert.match(surface,/aria-atomic="true"/)
  assert.match(surface,/permissionsCount>0/)
  assert.match(surface,/onOpenApprovals/)
  assert.match(surface,/new Date\(m\.time\)/)
})
test('输出区是新 UI 的工具消息卡片，不重新启动旧 Ink 终端',()=>{
  assert.match(surface,/TerminalChrome label="工具执行"/)
  assert.match(surface,/m\.kind==='tool'/)
  assert.match(surface,/aria-label="AI 对话区"/)
  assert.doesNotMatch(get('../../src/replLauncher.tsx'),/import\('\.\/screens\/REPL\.js'\)/)
})
