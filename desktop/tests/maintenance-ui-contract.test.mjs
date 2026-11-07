import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('新 UI 的智能执行与模型自检必须通过 Electron IPC 白名单', () => {
  const bridge = read('electron/main.ts')
  const allowed = bridge.match(/const permitted = new Set\(\[([\s\S]*?)\]\)/)?.[1]
  assert.ok(allowed, '缺少桌面 IPC 白名单')
  for (const method of ['smart.execute','smart.inspect','smart.history']) {
    assert.ok(allowed.includes(`'${method}'`), `${method} 未放行到本地 SDK 后端`)
  }
  const app = read('src/App.tsx')
  for (const method of ['smart.execute','smart.inspect','smart.history']) {
    assert.ok(app.includes(method), `${method} 没有接入新工作台`)
  }
})

test('所有新桌面显式操作自动核对 Electron 调用白名单和安全确认分支', () => {
  const bridge = read('electron/main.ts')
  const allowed = new Set((bridge.match(/const permitted = new Set\(\[([\s\S]*?)\]\)/)?.[1] ?? '')
    .match(/'[^']+'/g)?.map(name => name.slice(1, -1)) ?? [])
  const handled = new Set([...bridge.matchAll(/method===?'([^']+)'/g)].map(match => match[1]))
  const screens = ['src/App.tsx','src/components/layout/LocalMaintenance.tsx','src/components/layout/McpImportPanel.tsx']
  for (const screen of screens) {
    const calls = [...read(screen).matchAll(/(?:\binvoke|api\.call)(?:<[^]*?>)?\(\s*'([a-z][a-z0-9_.]+)'/g)]
      .map(match => match[1])
    assert.ok(calls.length > 1, screen + ' 未提取到界面后台操作')
    for (const method of calls)
      assert.ok(allowed.has(method) || handled.has(method),
        screen + ' 中 ' + method + ' 未连接到 Electron 后台')
  }
})

test('本地诊断、数据清理、批量 MCP 导入连接实际桌面协议', () => {
  const app = read('src/App.tsx')
  const diagnostics = read('src/components/layout/LocalMaintenance.tsx')
  const mcp = read('src/components/layout/McpImportPanel.tsx')
  const bridge = read('electron/main.ts')
  assert.match(app, /<LocalMaintenance/)
  assert.match(app, /<McpImportPanel/)
  for (const name of ['system.diagnostics', 'data.purge.preview', 'data.purge.apply']) {
    assert.ok(diagnostics.includes(name))
    assert.ok(bridge.includes(name))
  }
  for (const name of ['mcp.import.pick', 'mcp.import.apply']) {
    assert.ok(mcp.includes(name))
    assert.ok(bridge.includes(name))
  }
  assert.match(bridge, /dialog.showMessageBox/)
  assert.match(bridge, /pendingMcpImport/)
})

test('MCP 导入保留环境变量且仅在主进程持有文件内容', () => {
  const parser = read('electron/mcpImport.ts')
  const bridge = read('electron/main.ts')
  const panel = read('src/components/layout/McpImportPanel.tsx')
  assert.match(parser, /env: parsedEnv as Record<string, string>/)
  assert.match(bridge, /parseMcpImportFile\(JSON.parse\(await readFile/)
  assert.doesNotMatch(panel, /config\.env|TOKEN|process\.env/)
  assert.equal(existsSync(new URL('../../src/components/MCPServerDesktopImportDialog.tsx', import.meta.url)), false)
})

test('桌面功能接口不能只显示入口：每个实际请求都必须经 Electron 安全白名单或本地处理',()=>{
  const source=[read('src/App.tsx'),read('src/components/layout/LocalMaintenance.tsx'),read('src/components/layout/McpImportPanel.tsx')].join('\n')
  const electron=read('electron/main.ts')
  const registered=electron.match(/const permitted = new Set\(\[([\s\S]*?)\]\)/)?.[1]
  assert.ok(registered,'缺少 Electron 本地请求白名单')
  const allowed=new Set([...registered.matchAll(/'([^']+)'/g)].map(m=>m[1]))
  const local=new Set([...electron.matchAll(/\bmethod\s*===\s*'([^']+)'/g)].map(m=>m[1]))
  const required=new Set([...source.matchAll(/\b(?:invoke|api\.call)(?:<[^>]+>)?\(\s*['"]([^'"]+)['"]/g)].map(m=>m[1]))
  assert.ok(required.size>=40,'实际桌面请求提取结果异常，检查测试扫描范围')
  for(const method of required)assert.ok(allowed.has(method)||local.has(method),method+' 只有新 UI 入口，Electron 后台尚未放行')
})
