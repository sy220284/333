import { memo, type ReactNode } from 'react'

/** Render a practical Markdown subset without trusting model-produced HTML. */
function inline(text: string, onOpenLink?: (url:string)=>void): ReactNode[] {
  const result: ReactNode[] = []
  const tokens = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\[([^\]]+)\]\(([^)\s]+)\))/g
  let offset = 0
  for (const match of text.matchAll(tokens)) {
    const start = match.index ?? 0
    if (start > offset) result.push(text.slice(offset, start))
    const raw = match[0]
    const key = result.length
    if (raw.startsWith('`')) {
      result.push(<code key={key}>{raw.slice(1, -1)}</code>)
    } else if (raw.startsWith('**')) {
      result.push(<strong key={key}>{raw.slice(2, -2)}</strong>)
    } else {
      const label = match[2]
      const href = match[3]
      let safe = false
      try {
        const url = new URL(href)
        safe = (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password
      } catch {
        safe = false
      }
      result.push(safe
        ? <a key={key} href={href} target="_blank" rel="noopener noreferrer" onClick={onOpenLink?event=>{event.preventDefault();onOpenLink(href)}:undefined}>{label}</a>
        : raw)
    }
    offset = start + raw.length
  }
  if (offset < text.length) result.push(text.slice(offset))
  return result
}

const fence = /^\s*```([^\s`]*)\s*$/
const heading = /^(#{1,4})\s+(.+)$/
const bullet = /^\s*[-*+]\s+(.+)$/
const ordered = /^\s*\d+[.)]\s+(.+)$/

function MarkdownMessageView({text,onOpenLink}: {text: string;onOpenLink?: (url:string)=>void}) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { i++; continue }
    const code = line.match(fence)
    if (code) {
      i++
      const codeLines: string[] = []
      while (i < lines.length && !fence.test(lines[i])) codeLines.push(lines[i++])
      if (i < lines.length) i++
      blocks.push(<div className="markdown-code" key={blocks.length}>
        <div className="markdown-code-header"><span className="markdown-code-language">{code[1] || '纯文本'}</span><span className="markdown-code-kind">代码</span></div>
        <pre><code>{codeLines.join('\n')}</code></pre>
      </div>)
      continue
    }
    const head = line.match(heading)
    if (head) {
      const depth = Math.min(head[1].length, 4)
      const child = inline(head[2],onOpenLink)
      blocks.push(depth === 1 ? <h2 key={blocks.length}>{child}</h2> :
        depth === 2 ? <h3 key={blocks.length}>{child}</h3> :
        <h4 key={blocks.length}>{child}</h4>)
      i++
      continue
    }
    const listType = bullet.test(line) ? 'bullet' : ordered.test(line) ? 'ordered' : null
    if (listType) {
      const items: ReactNode[] = []
      const pattern = listType === 'bullet' ? bullet : ordered
      while (i < lines.length) {
        const m = lines[i].match(pattern)
        if (!m) break
        items.push(<li key={items.length}>{inline(m[1],onOpenLink)}</li>)
        i++
      }
      blocks.push(listType === 'bullet'
        ? <ul key={blocks.length}>{items}</ul>
        : <ol key={blocks.length}>{items}</ol>)
      continue
    }
    if (line.startsWith('> ')) {
      const quote: string[] = []
      while (i < lines.length && lines[i].startsWith('> ')) quote.push(lines[i++].slice(2))
      blocks.push(<blockquote key={blocks.length}>{inline(quote.join('\n'),onOpenLink)}</blockquote>)
      continue
    }
    const paragraph: string[] = []
    while (i < lines.length && lines[i].trim() &&
      !fence.test(lines[i]) && !heading.test(lines[i]) &&
      !bullet.test(lines[i]) && !ordered.test(lines[i]) &&
      !lines[i].startsWith('> ')) paragraph.push(lines[i++])
    if (paragraph.length) blocks.push(<p key={blocks.length}>{inline(paragraph.join('\n'),onOpenLink)}</p>)
  }
  return <div className="markdown-message">{blocks}</div>
}

/** Skip reformatting untouched assistant messages while other agents stream. */
export const MarkdownMessage = memo(MarkdownMessageView)
