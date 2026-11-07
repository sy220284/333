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

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

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
