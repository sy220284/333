import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const methods = (code, pattern) => [...code.matchAll(pattern)].map(match => match[1])
const protocol = read('src/services/desktop/protocol.ts')
const gateway = read('src/services/desktop/gateway.ts')
const electron = read('desktop/electron/main.ts')
const renderer = read('desktop/src/App.tsx')

test('桌面 RPC 全部声明均有真实后台分支和 Electron 暴露入口', () => {
  const declared = methods(protocol, /request\('([^']+)'/g)
  const handled = methods(gateway, /case '([^']+)'/g)
  const allowedSource = electron.match(/const permitted = new Set\(\[([\s\S]*?)\]\)/)?.[1]
  assert.ok(allowedSource, 'Electron 本地操作授权列表缺失')
  const allowed = methods(allowedSource, /'([^']+)'/g)
  assert.ok(declared.length >= 80, 'RPC 路由数量出现异常缩减')
  assert.equal(declared.length, new Set(declared).size, 'RPC 存在重复名称')
  assert.deepEqual([...new Set(handled)].sort(), [...declared].sort(),
    '协议与后台 handle 不一致，请检查未实现的请求')
  assert.deepEqual([...new Set(allowed)].sort(), [...declared].sort(),
    '协议与 Electron 安全授权列表不一致')
})

test('桌面页面声明的固定请求名称全部通到协议或受控的 Electron 本地处理器', () => {
  const declared = new Set(methods(protocol, /request\('([^']+)'/g))
  // Native actions are served by Electron, outside the desktopHost RPC protocol.
  const local = new Set(methods(electron, /method\s*===\s*'([^']+)'/g))
  const invoked = methods(renderer, /\b(?:invoke|api\.call)\s*(?:<[^;\n]+>)?\(\s*['"]([^'"]+)/g)
  assert.ok(invoked.length >= 50, '桌面操作入口扫描数量异常偏低')
  const missing = [...new Set(invoked)].filter(method => !declared.has(method) && !local.has(method))
  assert.deepEqual(missing, [], '桌面 UI 存在没有实际处理器的按钮操作')
})
