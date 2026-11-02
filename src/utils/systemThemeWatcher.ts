/**
 * Claude Code 2.1.310 terminal theme watcher.
 *
 * OSC 11 supplies the actual background color; CSI ? 997;1/2n is an
 * unsolicited theme-change signal. When multiplexer passthrough is blocked,
 * retry with a direct query instead of permanently ignoring auto-theme.
 */
import { oscColor, type TerminalQuerier } from '../ink/terminal-querier.js'
import { wrapForMultiplexer } from '../ink/termio/osc.js'
import { logForDebugging } from './debug.js'
import {
  setCachedSystemTheme,
  themeFromOscColor,
  type SystemTheme,
} from './systemTheme.js'

const DEFAULT_MUX_TIMEOUT_MS = 2_000

export function watchSystemTheme(
  querier: TerminalQuerier,
  onChange: (theme: SystemTheme) => void,
  options?: { muxTimeoutMs?: number },
): () => void {
  let stopped = false
  let querying = false
  const multiplexer = Boolean(process.env.TMUX || process.env.STY)
  const timeoutMs = options?.muxTimeoutMs ?? DEFAULT_MUX_TIMEOUT_MS

  async function queryColor(): Promise<void> {
    if (stopped || querying) return
    querying = true
    try {
      const basicQuery = oscColor(11)
      let reply: Awaited<ReturnType<typeof querier.send>>
      let method = 'direct'

      if (multiplexer) {
        const wrappedQuery = {
          ...basicQuery,
          request: wrapForMultiplexer(basicQuery.request),
        }
        let timeout: ReturnType<typeof setTimeout> | undefined
        const expired = new Promise<undefined>(resolve => {
          timeout = setTimeout(() => resolve(undefined), timeoutMs)
          timeout.unref?.()
        })
        try {
          reply = await Promise.race([querier.send(wrappedQuery), expired])
        } finally {
          if (timeout !== undefined) clearTimeout(timeout)
        }
        if (!reply) {
          // A timed-out multiplexer request must leave no orphan matcher.
          querier.cancel(wrappedQuery)
          if (stopped) return
          // Clear the pending response boundary before the direct retry.
          void querier.flush()
          method = 'mux-bare'
          const rawReply = querier.send(basicQuery)
          const barrier = querier.flush()
          ;[reply] = await Promise.all([rawReply, barrier])
        } else {
          method = 'dcs'
        }
      } else {
        const rawReply = querier.send(basicQuery)
        const barrier = querier.flush()
        ;[reply] = await Promise.all([rawReply, barrier])
      }

      if (stopped) return
      if (!reply) {
        logForDebugging(`systemTheme: OSC 11 query (via=${method}) got no response`)
        return
      }
      const theme = themeFromOscColor(reply.data)
      logForDebugging(
        `systemTheme: OSC 11 response=${reply.data} detected=${theme} via=${method}`,
      )
      if (!theme) return
      setCachedSystemTheme(theme)
      onChange(theme)
    } catch (error) {
      logForDebugging(
        `systemTheme: OSC 11 query failed: ${error instanceof Error ? error.message : String(error)}`,
      )
      throw error
    } finally {
      querying = false
    }
  }

  const unsubscribe = querier.subscribeThemeChange(() => {
    // A theme-change push is a signal to re-query the actual OSC 11
    // background: it is not always the true surface color in terminals.
    void queryColor()
  })

  // In the standard interactive session the target performs the first
  // query immediately; daemon sessions wait until a client is attached.
  if (process.env.CLAUDE_BG_BACKEND !== 'daemon') {
    void queryColor()
  }

  return () => {
    stopped = true
    unsubscribe()
  }
}
