import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { renderAuthResultPage, authResultAssets } from '../src/services/mcp/authResultPage.ts'

test('授权成功页使用新版字体、勾选动画并延迟关闭窗口', () => {
  const page = renderAuthResultPage({ ok: true, heading: '授权成功', message: '请返回 Claude Code' })
  assert.match(page, /<html lang="zh-CN">/)
  assert.match(page, /font-family:"anthropic-sans"/)
  assert.match(page, /<svg class="pixelgram" viewBox="0 0 20 20"/)
  assert.match(page, /<animate attributeName="fill-opacity"/)
  assert.match(page, /prefers-reduced-motion:reduce/)
  assert.match(page, /setTimeout\(function\(\)\{try\{window\.close\(\)\}catch\(e\)\{\}\},1500\)/)
  assert.equal(createHash('sha256').update(Buffer.from(authResultAssets.sans, 'base64')).digest('hex'), 'c5bbe23d93c6ca027d4f80d8126578531be9bf79fad3b3becf43c49be1b60b0e')
  assert.equal(createHash('sha256').update(Buffer.from(authResultAssets.serif, 'base64')).digest('hex'), '993aed14940fe69a8062ed6117f52bff394c4d68393d95e05b70154ab70fbd17')
})

test('授权失败页显示断链动画、转义服务端错误并留在页面', () => {
  const page = renderAuthResultPage({ ok: false, heading: '授权失败', message: '请重试', detail: '<script>alert("x")</script> & 错误' })
  assert.notEqual(page.match(/<g class="moving">([\s\S]*?)<\/g>/)?.[1], renderAuthResultPage({ ok: true, heading: '成功', message: '' }).match(/<g class="moving">([\s\S]*?)<\/g>/)?.[1])
  assert.match(page, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; &amp; 错误/)
  assert.doesNotMatch(page, /window\.close\(\)/)
  assert.match(page, /@media \(prefers-color-scheme:dark\)/)
})

test('独立构建产物保留授权页面和新版字体素材', () => {
  const bundle = readFileSync(new URL('../dist/cli.js', import.meta.url), 'utf8')
  assert.ok(bundle.includes(authResultAssets.sans.slice(0, 80)))
  assert.ok(bundle.includes(authResultAssets.serif.slice(0, 80)))
  const escaped = text => [...text].map(char => `\\u${char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`).join('')
  assert.ok(bundle.includes(escaped('身份验证成功')))
  assert.ok(bundle.includes(escaped('身份提供方登录失败')))
})
