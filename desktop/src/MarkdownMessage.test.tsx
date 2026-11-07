import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MarkdownMessage } from './MarkdownMessage'

describe('AI 消息的安全排版', () => {
  it('显示代码块、标题、列表与强调文本', () => {
    const html = renderToStaticMarkup(<MarkdownMessage text={'## 审查结果\n- **通过**\n- 继续\n\n```ts\nconst a = 1\n```'}/>)
    expect(html).toContain('<h3>')
    expect(html).toContain('<strong>通过</strong>')
    expect(html).toContain('<li>')
    expect(html).toContain('markdown-code-language')
    expect(html).toContain('const a = 1')
  })
  it('阻止非 HTTP 链接与原始 HTML 注入', () => {
    const html = renderToStaticMarkup(<MarkdownMessage text={'[不可信](javascript:alert%281%29) <img src=x onerror=alert(1)> [安全](https://example.com)'}/>)
    expect(html).not.toContain('href="javascript:')
    expect(html).toContain('&lt;img')
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('noopener noreferrer')
  })
  it('流式响应中尚未结束的代码围栏也能显示', () => {
    const html = renderToStaticMarkup(<MarkdownMessage text={'```bash\necho ready'}/>)
    expect(html).toContain('echo ready')
  })
})
