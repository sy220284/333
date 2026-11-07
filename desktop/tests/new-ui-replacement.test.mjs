import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
const src=relative=>readFileSync(new URL(relative,import.meta.url),'utf8')
test('桌面使用原生UI的新页面并不存在旧UI回退入口',()=>{
  const app=src('../src/App.tsx'),layout=src('../src/theme/yaoyao-layout.css')
  for(const route of ['dashboard','chat','agents','missions','files','models','integrations','github','history','settings'])assert.ok(app.includes(`view==='${route}'`),`${route} 缺失`)
  for(const legacy of ['cc-workspace-shell','cc-sidebar','cc-home-page','className="chat-page"','className="stack-page"','className="mission-page"','className="files-page"','className="model-grid"','className="integration-grid"'])assert.equal(app.includes(legacy),false,`仍使用旧界面结构 ${legacy}`)
  assert.equal(existsSync(new URL('../src/styles.css',import.meta.url)),false)
  assert.equal(existsSync(new URL('../src/cc-haha-theme.css',import.meta.url)),false)
  assert.ok(app.includes('NewSessionStarter'))
  assert.ok(app.includes('SessionChatSurface'))
  assert.ok(app.includes('WorkspaceInspector'))
  assert.ok(app.includes('Modal'))
  assert.ok(layout.includes('.markdown-message'))
  assert.equal(app.includes('className="modal-backdrop"'),false)
  assert.equal(app.includes('className="command-backdrop"'),false)
  assert.equal(app.includes('className="inspector"'),false)
  assert.ok(layout.includes('.yy-nav-link'))
  assert.equal(layout.includes('.text-button {'),false)
  assert.equal(layout.includes('.git-output,'),false)
  assert.ok(layout.includes('.yy-tab'))
})
test('工作项卡片采用纵向结构，操作按钮保持可读', () => {
  const app=src('../src/App.tsx'),layout=src('../src/theme/yaoyao-layout.css')
  assert.equal(app.includes('className="job-card"'),false)
  assert.equal(layout.includes('.job-card'),false)
  assert.ok(app.includes('<Card key={job.id} radius="lg" padding="md"'))
  assert.ok(app.includes('className="mt-3 flex flex-wrap gap-2"'))
})

test('新 UI 业务入口对应实际回调，重要危险操作仍保留确认',()=>{
  const app=src('../src/App.tsx')
  for(const name of ['sessions.open','sessions.send','sessions.interrupt','sessions.setModel','agents.setMode','missions.jobs.runQueue','missions.jobs.approve','workspace.read','workspace.write','mcp.toggle','mcp.remove','host.reject'])assert.ok(app.includes(name),`缺少 ${name}`)
  assert.ok(app.includes('window.confirm'))
  assert.ok(app.includes('onSuggestion={toChat}'))
})

test('剔除未接入的原项目 UI 样式与冗余组件，不改变本地功能入口',()=>{
  const theme=src('../src/theme/globals.css'),manifest=JSON.parse(src('../package.json'))
  const sourceOnly=['.pet-mascot-button','.pet-window-root','[data-touch-h5]','.token-usage-root','.settings-zoom-control','.agent-teams-bot','.composer-pm','.code-viewer-area','.sidebar-resize-handle','.tab-strip-hit-region']
  for(const item of sourceOnly)assert.equal(theme.includes(item),false,`未清理来源项目独有样式 ${item}`)
  for(const token of ['--color-surface:','--color-brand:','--color-code-bg:','--shadow-composer:'])assert.ok(theme.includes(token),`缺少必要语义令牌 ${token}`)
  assert.equal(existsSync(new URL('../src/components/ui/IconButton.tsx',import.meta.url)),false)
  assert.equal(Boolean(manifest.devDependencies['@tailwindcss/typography']),false)
  assert.equal(theme.includes('--color-activity-heat-'),false,'删除原来源独立热力图的无引用调色令牌')
  assert.ok(theme.length<60000,'移植 CSS 仍带有大面积来源功能样式')
})
