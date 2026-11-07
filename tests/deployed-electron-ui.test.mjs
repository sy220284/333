import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readdir, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function findPackagedExecutable() {
  const folder = resolve('desktop/release/linux-unpacked')
  const names = await readdir(folder)
  const excluded = /^(chrome-sandbox|chrome_crashpad_handler|chrome-wrapper|lib.*|LICENSE.*|resources|locales|swiftshader|v8_context_snapshot.*|icudtl\.dat|snapshot_blob.*|vk_swiftshader.*|version|\.DS_Store)$/
  for (const name of names) {
    if (excluded.test(name)) continue
    const path = join(folder, name)
    const info = await stat(path)
    if (info.isFile() && (info.mode & 0o111) !== 0 && info.size > 8_000_000)
      return path
  }
  throw new Error(`未发现已打包可执行程序，实际目录：${names.join(', ')}`)
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = address.port
      server.close(() => resolve(port))
    })
  })
}

async function screenshot(pageUrl, path) {
  const socket = new WebSocket(pageUrl)
  const data = await new Promise((resolve, reject) => {
    const deadline = setTimeout(() => {
      socket.close()
      reject(new Error('Electron 可视化截图超时'))
    }, 7000)
    socket.addEventListener('open', () =>
      socket.send(JSON.stringify({ id: 2, method: 'Page.captureScreenshot', params: { format: 'png' } })))
    socket.addEventListener('message', event => {
      const frame = JSON.parse(event.data)
      if (frame.id !== 2) return
      clearTimeout(deadline)
      socket.close()
      if (typeof frame.result?.data !== 'string') reject(new Error('Electron 没有返回可视化截图'))
      else resolve(frame.result.data)
    })
    socket.addEventListener('error', () => {
      clearTimeout(deadline)
      reject(new Error('Electron 截图调试通道已断开'))
    })
  })
  await writeFile(path, Buffer.from(data, 'base64'))
}

async function evaluate(pageUrl, expression) {
  const socket = new WebSocket(pageUrl)
  return new Promise((resolve, reject) => {
    const deadline = setTimeout(() => {
      socket.close()
      reject(new Error('打包 Electron 页面调试连接超时'))
    }, 7000)
    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({
        id: 1, method: 'Runtime.evaluate',
        params: { expression, returnByValue: true },
      }))
    })
    socket.addEventListener('message', event => {
      try {
        const result = JSON.parse(event.data)
        if (result.id !== 1) return
        clearTimeout(deadline)
        socket.close()
        if (result.error || result.result?.exceptionDetails)
          reject(new Error(JSON.stringify(result.error ?? result.result.exceptionDetails)))
        else resolve(result.result?.result?.value)
      } catch (error) {
        clearTimeout(deadline)
        socket.close()
        reject(error)
      }
    })
    socket.addEventListener('error', error => {
      clearTimeout(deadline)
      socket.close()
      reject(new Error(`Electron 调试连接失败：${String(error.message)}`))
    })
  })
}

test('真实 Linux 安装版启动 Electron 界面并完成本地 Host 连接', {
  timeout: 95000,
}, async () => {
  const exe = await findPackagedExecutable()
  const port = await freePort()
  const args = ['-a', exe, '--disable-gpu', '--disable-dev-shm-usage',
    '--no-sandbox', '--remote-debugging-address=127.0.0.1',
    `--remote-debugging-port=${port}`]
  const child = spawn('xvfb-run', args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
      YAOYAO_E2E_SMOKE: '1',
    },
    detached: true, stdio: ['ignore','pipe','pipe'],
  })
  let stderr = ''
  child.stderr.on('data', data => { stderr = (stderr + data.toString()).slice(-5000) })
  let launched = true
  child.on('exit', () => { launched = false })
  try {
    const deadline = Date.now() + 50000
    let page
    while (Date.now() < deadline) {
      if (!launched) throw new Error(`已打包Electron进程提前退出：${stderr}`)
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
          signal: AbortSignal.timeout(1500),
        })
        const tabs = await response.json()
        page = tabs.find(tab => tab.type === 'page' && typeof tab.webSocketDebuggerUrl === 'string')
        if (page) break
      } catch { /* Chromium startup in progress */ }
      await sleep(350)
    }
    if (!page) throw new Error(`Electron 页面没有启动或没有可连接的渲染进程：${stderr}`)
    let last = ''
    while (Date.now() < deadline) {
      const result = await evaluate(page.webSocketDebuggerUrl,
        '({title:document.title,text:document.body?.innerText??"",state:document.readyState})')
      last = JSON.stringify(result).slice(0,1500)
      if (result?.text?.includes('摇摇车') &&
          result?.text?.includes('智能体') &&
          result?.text?.includes('本地后台已连接')) {
        assert.equal(result.state, 'complete')
        await screenshot(page.webSocketDebuggerUrl, 'desktop/release/deployed-workbench-smoke.png')
        // Verify actual packaged UI navigation, not only React test mocks.
        // A user can reach the two different agent modes and the Mission board
        // from the installed app while the native Host remains connected.
        async function navigate(label, expected, screenshotFile) {
          const clicked = await evaluate(page.webSocketDebuggerUrl,
            `(()=>{const button=[...document.querySelectorAll('nav.nav-links button')].find(b=>b.textContent?.includes(${JSON.stringify(label)}));if(!button)return false;button.click();return true})()`)
          assert.equal(clicked, true, `发行界面不存在导航入口：${label}`)
          await sleep(500)
          const text = await evaluate(page.webSocketDebuggerUrl, 'document.body?.innerText??""')
          assert.ok(text.includes(expected),
            `导航到 ${label} 后缺少真实功能内容 ${expected}：${text.slice(0,700)}`)
          assert.ok(text.includes('本地后台已连接'), '切换页面后桌面宿主必须保持连接')
          await screenshot(page.webSocketDebuggerUrl, screenshotFile)
        }
        await navigate('智能体团队','Super Agents 团队模式','desktop/release/deployed-agents-smoke.png')
        await navigate('长期任务','创建长期任务','desktop/release/deployed-missions-smoke.png')

        // Exercise the installed renderer -> Electron IPC -> compiled native
        // Host -> durable on-disk Mission/Job flow, entirely offline.
        async function fill(selector, value) {
          const changed = await evaluate(page.webSocketDebuggerUrl,
            `(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return false;const klass=el.tagName==='TEXTAREA'?HTMLTextAreaElement:HTMLInputElement;const setter=Object.getOwnPropertyDescriptor(klass.prototype,'value')?.set;if(!setter)return false;setter.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));return true})()`)
          assert.equal(changed, true, `发行界面缺少输入框 ${selector}`)
          await sleep(120)
        }
        async function click(label) {
          const found = await evaluate(page.webSocketDebuggerUrl,
            `(()=>{const btn=[...document.querySelectorAll('button')].find(b=>b.textContent?.includes(${JSON.stringify(label)}));if(!btn||btn.disabled)return false;btn.click();return true})()`)
          assert.equal(found, true, `发行界面按钮不可点击：${label}`)
        }
        async function expectText(text) {
          let body = ''
          for (let i = 0; i < 45; i++) {
            body = await evaluate(page.webSocketDebuggerUrl,'document.body?.innerText??""')
            if (body.includes(text)) return
            await sleep(140)
          }
          throw new Error(`真实安装版未完成用户操作 ${text}，页面：${body.slice(0,1500)}`)
        }

        await fill('.mission-list-column textarea','部署用户路径验收：离线检查长期目标与任务记录')
        await click('创建并选中任务')
        await expectText('部署用户路径验收：离线检查长期目标与任务记录')
        await expectText('Super Agents 工作项')
        await screenshot(page.webSocketDebuggerUrl,'desktop/release/deployed-mission-created-smoke.png')

        await fill('input[aria-label="工作项标题"]','离线工作项验收')
        await fill('textarea[aria-label="工作项执行指令"]','仅验证持久化和页面交互，明确不启动模型')
        await click('添加工作项')
        await expectText('离线工作项验收')
        await expectText('排队中')
        await screenshot(page.webSocketDebuggerUrl,'desktop/release/deployed-mission-queued-smoke.png')

        await navigate('智能体团队','Super Agents 团队模式','desktop/release/deployed-agents-smoke.png')
        await click('Super Agents 团队模式')
        let mode = false
        for (let attempt = 0; attempt < 30; attempt++) {
          mode = await evaluate(page.webSocketDebuggerUrl,
            'document.querySelector(".mode-card:nth-child(2)")?.classList.contains("selected")??false')
          if (mode) break
          await sleep(120)
        }
        assert.equal(mode, true, '用户切换 Super Agents 模式后界面状态未更新')
        await screenshot(page.webSocketDebuggerUrl,'desktop/release/deployed-agents-super-smoke.png')
        return
      }
      await sleep(550)
    }
    throw new Error(`打包桌面页面未完成真实后端连接。页面：${last}，进程：${stderr}`)
  } finally {
    if (child.pid) {
      try { process.kill(-child.pid, 'SIGTERM') } catch {}
    }
    await Promise.race([
      new Promise(resolve => child.once('close', resolve)),
      sleep(6000),
    ])
  }
})
