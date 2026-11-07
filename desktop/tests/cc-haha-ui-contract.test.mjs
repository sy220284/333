import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8')
const main=readFileSync(new URL('../src/main.tsx',import.meta.url),'utf8')
const css=readFileSync(new URL('../src/cc-haha-theme.css',import.meta.url),'utf8')

test('新桌面 UI 保留真实会话/工作区入口，不恢复旧仪表盘宣传界面',()=>{
  for(const marker of ['cc-workspace-shell','cc-sidebar','cc-tabs','cc-home-page','cc-starter-surface','sessions.list','sessions.ensureOpen','missions.jobs.runQueue','permissions.decide']){
    assert.ok(app.includes(marker),`缺少真实功能或界面入口：${marker}`)
  }
  assert.equal(app.includes('GOOD TO SEE YOU AGAIN'),false)
  assert.equal(app.includes('dashboard-stats'),false)
  assert.ok(main.includes("import './cc-haha-theme.css'"))
})
test('六套界面主题和旧偏好同时可用',()=>{
  for(const theme of ['white','paper','warm-classic','celadon','dark','ink-blue']){
    assert.ok(css.includes(`[data-cc-theme=${theme}]`),`缺少主题：${theme}`)
    assert.ok(app.includes(`'${theme}'`),`缺少主题状态：${theme}`)
  }
  assert.match(app,/localStorage\.setItem\(`\$\{PREF\}dark`,String\(isDark\)\)/)
  assert.match(app,/localStorage\.setItem\(`\$\{PREF\}theme`,themeVariant\)/)
})

test('主题选择器覆盖旧暗色规则且窄窗口保留可见导航',()=>{
 for (const name of ['white','paper','warm-classic','celadon','dark','ink-blue'])
   assert.ok(css.includes(`:root[data-cc-theme=${name}]`))
 assert.ok(css.includes('.cc-grouped-nav .nav-item span{display:inline'))
 assert.ok(css.includes('.cc-workspace-shell .approval-target pre'))
 assert.ok(css.includes('.cc-workspace-shell .command-dialog'))
 assert.ok(css.includes('@media(prefers-reduced-motion:reduce)'))
})

test('仓库审查入口不绑定指定 PR 编号',()=>{
 assert.equal(app.includes('审查当前 Git 工作区和 PR19'),false)
 assert.ok(app.includes('关联 Pull Request'))
})

test('六套主题的正文和辅助文字维持可读对比度',()=>{
  const luminance=color=>{
    const s=color.slice(1)
    const channel=x=>{const v=parseInt(x,16)/255;return v<=0.04045?v/12.92:((v+.055)/1.055)**2.4}
    return .2126*channel(s.slice(0,2))+.7152*channel(s.slice(2,4))+.0722*channel(s.slice(4,6))
  }
  const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
  for (const theme of ['white','paper','warm-classic','celadon','dark','ink-blue']){
    const style=css.match(new RegExp(`:root\\[data-cc-theme=${theme}\\]\\{([^}]*)\\}`))
    assert.ok(style,`${theme} 缺少样式`)
    const tokens=Object.fromEntries([...style[1].matchAll(/--([a-z-]+):\s*(#[0-9A-Fa-f]{6})/g)].map(m=>[m[1],m[2]]))
    for (const textToken of ['text','muted','subtle','accent']){
      assert.ok(contrast(tokens[textToken],tokens.surface)>=4.5,`${theme} ${textToken} 对比度不足`)
    }
  }
})
