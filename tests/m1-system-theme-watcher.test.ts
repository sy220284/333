import { describe, expect, test } from 'bun:test'
import {
  INITIAL_STATE,
  parseMultipleKeypresses,
} from '../src/ink/parse-keypress.js'
import { TerminalQuerier, oscColor } from '../src/ink/terminal-querier.js'
import { watchSystemTheme } from '../src/utils/systemThemeWatcher.js'
import { getSystemThemeName } from '../src/utils/systemTheme.js'

describe('2.1.310 terminal OSC11 and theme push', () => {
  test('CSI ? 997;1n and 997;2n are terminal responses rather than keys', () => {
    for (const [digit, dark] of [['1', true], ['2', false]] as const) {
      const [items] = parseMultipleKeypresses(
        '\x1b[?997;' + digit + 'n',
        INITIAL_STATE,
      )
      const event = items.find(item => item.kind === 'response')
      expect(event?.kind).toBe('response')
      if (event?.kind === 'response') {
        expect(event.response).toEqual({ type: 'themeNotify', dark })
      }
    }
  })

  test('TerminalQuerier dispatches push, cancels pending OSC requests, and unsubscribes', async () => {
    const writes: string[] = []
    const stdout = { write: (text: string) => { writes.push(text); return true } } as unknown as NodeJS.WriteStream
    const querier = new TerminalQuerier(stdout)
    const events: boolean[] = []
    const unsubscribe = querier.subscribeThemeChange(dark => events.push(dark))
    const q = oscColor(11)
    const pending = querier.send(q)
    querier.onResponse({ type: 'themeNotify', dark: true })
    expect(events).toEqual([true])
    querier.cancel(q)
    expect(await pending).toBeUndefined()
    unsubscribe()
    querier.onResponse({ type: 'themeNotify', dark: false })
    expect(events).toEqual([true])
    expect(writes.some(s => s.includes('11;?'))).toBe(true)
  })

  test('watcher does initial detection, responds to changes and releases subscriber', async () => {
    const oldTmux = process.env.TMUX
    const oldSty = process.env.STY
    const oldBackend = process.env.CLAUDE_BG_BACKEND
    delete process.env.TMUX
    delete process.env.STY
    delete process.env.CLAUDE_BG_BACKEND
    try {
      let color = 'rgb:ffff/ffff/ffff'
      let callback: ((dark: boolean) => void) | undefined
      let subscribed = 0
      let queries = 0
      let flushed = 0
      const fake = {
        send: async (query: { request: string }) => {
          expect(query.request).toContain('11;?')
          queries++
          return { type: 'osc' as const, code: 11, data: color }
        },
        flush: async () => { flushed++ },
        cancel: () => {},
        subscribeThemeChange: (fn: (dark: boolean) => void) => {
          callback = fn
          subscribed++
          return () => { callback = undefined; subscribed-- }
        },
      } as unknown as TerminalQuerier
      const seen: string[] = []
      const release = watchSystemTheme(fake, theme => seen.push(theme))
      await new Promise(resolve => setTimeout(resolve, 5))
      expect(seen).toEqual(['light'])
      expect(getSystemThemeName()).toBe('light')
      color = 'rgb:0000/0000/0000'
      callback?.(true)
      await new Promise(resolve => setTimeout(resolve, 5))
      expect(seen).toEqual(['light', 'dark'])
      expect(getSystemThemeName()).toBe('dark')
      expect(queries).toBe(2)
      expect(flushed).toBe(2)
      release()
      expect(subscribed).toBe(0)
    } finally {
      if (oldTmux === undefined) delete process.env.TMUX
      else process.env.TMUX = oldTmux
      if (oldSty === undefined) delete process.env.STY
      else process.env.STY = oldSty
      if (oldBackend === undefined) delete process.env.CLAUDE_BG_BACKEND
      else process.env.CLAUDE_BG_BACKEND = oldBackend
    }
  })
})
