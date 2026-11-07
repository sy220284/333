import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const from = relative => new URL(relative, import.meta.url)
const app = readFileSync(from('../src/App.tsx'), 'utf8')
const main = readFileSync(from('../src/main.tsx'), 'utf8')
const theme = readFileSync(from('../src/theme/globals.css'), 'utf8')
const layout = readFileSync(from('../src/theme/yaoyao-layout.css'), 'utf8')
const packageJson = JSON.parse(readFileSync(from('../package.json'), 'utf8'))

test('旧界面入口和叠加主题从仓库与加载链路真正删除', () => {
  assert.equal(existsSync(from('../src/styles.css')), false)
  assert.equal(existsSync(from('../src/cc-haha-theme.css')), false)
  assert.ok(main.includes("import './theme/globals.css'"))
  assert.ok(main.includes("import './theme/yaoyao-layout.css'"))
  assert.equal(main.includes('styles.css'), false)
  assert.equal(main.includes('cc-haha-theme.css'), false)
  assert.equal(app.includes('cc-workspace-shell'), false)
  assert.equal(app.includes('cc-sidebar'), false)
  assert.equal(app.includes('cc-tabbar'), false)
  assert.equal(app.includes('brandIconUrl'), false)
  assert.equal(app.includes('GOOD TO SEE YOU AGAIN'), false)
})
test('引入 cc-haha 原生卡片按钮状态及空白页组件和完整主题文件', () => {
  for (const name of ['Button','Card','Badge','EmptyState']) {
    assert.ok(existsSync(from('../src/components/ui/'+name+'.tsx')),name+' 原生组件缺失')
    assert.ok(app.includes("from './components/ui/"+name+"'"),name+' 未实际接线')
  }
  assert.ok(layout.includes('var(--color-surface-container-lowest)'))
  assert.ok(layout.includes('var(--shadow-composer)'))
  assert.ok(theme.includes('@theme {'))
  assert.ok(theme.includes('@keyframes'))
  assert.ok(packageJson.devDependencies['@tailwindcss/vite'])
  assert.ok(packageJson.devDependencies['tailwindcss'])
})
test('源码六套主题通过单一 data-theme 选择器控制，不受旧主题层覆盖', () => {
  for (const name of ['white','paper','warm-classic','celadon','dark','ink-blue']) {
    assert.ok(theme.includes('[data-theme="'+name+'"]'),name+' 主题缺失')
    assert.ok(app.includes("'"+name+"'"),name+' 主题状态缺失')
  }
  assert.match(app,/document\.documentElement\.dataset\.theme=themeVariant/)
  assert.doesNotMatch(app,/dataset\.ccTheme/)
  assert.ok(layout.includes('@media(prefers-reduced-motion:reduce)'))
  assert.ok(layout.includes('[data-motion=off]'))
})
test('新布局和全部十个业务入口接入 333 通信层，取消固定 PR19 操作', () => {
  for (const id of ['dashboard','chat','agents','missions','files','models','integrations','github','history','settings']) {
    assert.ok(app.includes("{id:'"+id+"'"),id+' 未接入导航')
  }
  for (const api of ['sessions.list','sessions.ensureOpen','sessions.send','sessions.interrupt','agents.setMode','missions.jobs.runQueue','workspace.read','workspace.write','models.list','mcp.list','permissions.decide']) {
    assert.ok(app.includes(api),'丢失调用 '+api)
  }
  assert.ok(app.includes('id="sidebar-shell"'))
  assert.ok(app.includes('id="content-area"'))
  assert.ok(app.includes('yy-tabbar'))
  assert.ok(app.includes('yy-tab-strip'))
  assert.equal(app.includes('审查当前 Git 工作区和 PR19'),false)
})
test('新 UI 版权与原项目许可已明确保存', () => {
  const notice=readFileSync(from('../../SOURCE_NOTICES.md'),'utf8')
  const license=readFileSync(from('../THIRD_PARTY_CC_HAHA_LICENSE.txt'),'utf8')
  assert.ok(notice.includes('Based on cc-haha'))
  assert.ok(license.includes('Community Source License 1.0'))
  assert.ok(app.includes('Copyright (c) 2026 cc-haha'))
})
