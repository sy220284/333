/** Former Ink conversation entrypoint: redirect to the independent desktop UI. */
import type React from 'react'
import type { Root } from './ink.js'
import type { StatsStore } from './context/stats.js'
import type { AppState } from './state/AppStateStore.js'
import type { FpsMetrics } from './utils/fpsTracker.js'

type AppWrapperProps = {
  getFpsMetrics: () => FpsMetrics | undefined
  stats?: StatsStore
  initialState: AppState
}
export async function launchRepl(
  _root: Root,
  _appProps: AppWrapperProps,
  _replProps: unknown,
  _renderAndRun: (root: Root, element: React.ReactNode) => Promise<void>,
): Promise<void> {
  const { parseDesktopCliOptions, launchDesktopFromCli } = await import('./cli/desktop/launch.ts')
  const argv=process.argv.slice(2)
  const { prompt, options }=parseDesktopCliOptions(argv)
  process.exitCode=await launchDesktopFromCli({prompt,options,argv})
}
