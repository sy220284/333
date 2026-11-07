import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
test('交互式 CLI 已切换至新桌面，SDK 仍可无界面调用',()=>{
  const cli=read('src/entrypoints/cli.tsx')
  const routing=read('src/entrypoints/startupRouting317.ts')
  const launcher=read('src/cli/desktop/launch.ts')
  assert.ok(cli.includes('isDesktopWorkbenchLaunch(args)'))
  assert.ok(cli.indexOf('isDesktopWorkbenchLaunch(args)')<cli.indexOf("import('../main.js')"))
  assert.ok(routing.includes("'-p','--print'"))
  assert.ok(routing.includes("'--output-format'"))
  assert.ok(launcher.includes('YAOYAO_DESKTOP_APP'))
  assert.equal(launcher.includes('isClaudeAISubscriber'),false)
  assert.equal(launcher.includes('openDesktopTarget'),false)
})
test('GUI 启动传入工作区与会话，真实 SDK 恢复路径保留',()=>{
  const main=read('desktop/electron/main.ts'),app=read('desktop/src/App.tsx')
  assert.ok(main.includes('hasLaunchWorkspace'))
  assert.ok(main.includes('YAOYAO_INITIAL_SESSION_ID'))
  assert.ok(app.includes('if(info.startupSessionId)await resumeSession(info.startupSessionId)'))
  assert.ok(app.includes("('sessions.ensureOpen',{sessionId:id})"))
})
