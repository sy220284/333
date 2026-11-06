import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const root = new URL('../', import.meta.url)
const source = path => readFileSync(new URL(path, root), 'utf8')

test('桌面安全网关完整放行工作项队列与人工审核方法', () => {
  const main = source('electron/main.ts')
  const protocol = source('../src/services/desktop/protocol.ts')
  for (const action of [
    'list', 'enqueue', 'start', 'runBatch', 'approve', 'retry', 'recover', 'cancel',
  ]) {
    assert.ok(main.includes(`'missions.jobs.${action}'`), `Electron IPC 未开放 ${action}`)
    assert.ok(protocol.includes(`request('missions.jobs.${action}'`), `后端协议缺少 ${action}`)
  }
})

test('桌面长期任务工作台提供真实执行入口与安全状态动作', () => {
  const app = source('src/App.tsx')
  assert.match(app, /missions\.jobs\.list/)
  assert.match(app, /missions\.jobs\.enqueue/)
  assert.match(app, /missions\.jobs\.runBatch/)
  assert.match(app, /missions\.jobs\.start/)
  assert.match(app, /missions\.jobs\.approve/)
  assert.match(app, /missions\.jobs\.retry/)
  assert.match(app, /missions\.jobs\.recover/)
  assert.match(app, /sessions\.interrupt/)
  assert.match(app, /selectedMissionRef\.current/)
  assert.match(app, /window\.confirm/)
  assert.doesNotMatch(app, /job\.status==='running'&&<button onClick=\{\(\)=>void jobAction\('missions\.jobs\.cancel'/)
})

test('长期任务视图显示正确的检查点、执行次数、终态和异常恢复说明', () => {
  const app = source('src/App.tsx')
  const css = source('src/styles.css')
  assert.match(app, /selected\.checkpoint/)
  assert.match(app, /执行次数：\{job\.attempt\}/)
  assert.match(app, /状态|待审核/)
  assert.match(css, /\.job-card:focus-within/)
  assert.match(css, /prefers-reduced-motion/)
})
