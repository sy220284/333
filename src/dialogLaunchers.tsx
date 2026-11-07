/**
 * Thin launchers for one-off dialog JSX sites in main.tsx.
 * Each launcher dynamically imports its component and wires the `done` callback
 * identically to the original inline call site. Zero behavior change.
 *
 * Part of the main.tsx React/JSX extraction effort. See sibling PRs
 * perf/extract-interactive-helpers and perf/launch-repl.
 */
import { createElement } from 'react';
import type { StatsStore } from './context/stats.js';
import type { Root } from './ink.js';
import { showSetupDialog } from './interactiveHelpers.js';
import type { AppState } from './state/AppStateStore.js';
import type { AgentMemoryScope } from './tools/AgentTool/agentMemory.js';
import type { TeleportRemoteResponse } from './utils/conversationRecovery.js';
import type { FpsMetrics } from './utils/fpsTracker.js';
import type { ValidationError } from './utils/settings/validation.js';

/**
 * Site ~3173: 旧版快照更新弹窗入口；2.1.310 统一选择 keep。
 * 函数签名保留供既有调用者安全清理 pendingSnapshotUpdate。
 */
/**
 * 2.1.310 源码证据：chunk-0x2m04n3.js:684
 *   async function J(o, t) { return "keep"; }
 * 目标版不会显示快照更新弹窗，也不会自动执行 merge/replace。
 * 保留旧函数签名，避免调用者行为和返回值发生额外变化。
 */
export async function launchSnapshotUpdateDialog(_root: Root, _props: {
  agentType: string;
  scope: AgentMemoryScope;
  snapshotTimestamp: string;
}): Promise<'merge' | 'keep' | 'replace'> {
  return 'keep';
}

/**
 * Site ~3250: InvalidSettingsDialog (settings validation errors).
 * Original callback wiring: onContinue={done}, onExit passed through from caller.
 */
export async function launchInvalidSettingsDialog(root: Root, props: {
  settingsErrors: ValidationError[];
  onExit: () => void;
}): Promise<void> {
  const {
    InvalidSettingsDialog
  } = await import('./components/InvalidSettingsDialog.js');
  return showSetupDialog(root, done => createElement(InvalidSettingsDialog,{settingsErrors:props.settingsErrors,onContinue:done,onExit:props.onExit}));
}

/**
 * Site ~4549: TeleportResumeWrapper (interactive teleport session picker).
 * Original callback wiring: onComplete={done}, onCancel={() => done(null)}, source="cliArg".
 */
export async function launchTeleportResumeWrapper(root: Root): Promise<TeleportRemoteResponse | null> {
  const {
    TeleportResumeWrapper
  } = await import('./components/TeleportResumeWrapper.js');
  return showSetupDialog<TeleportRemoteResponse | null>(root, done => createElement(TeleportResumeWrapper,{onComplete:done,onCancel:()=>done(null),source:'cliArg'}));
}

/**
 * Site ~4597: TeleportRepoMismatchDialog (pick a local checkout of the target repo).
 * Original callback wiring: onSelectPath={done}, onCancel={() => done(null)}.
 */
export async function launchTeleportRepoMismatchDialog(root: Root, props: {
  targetRepo: string;
  initialPaths: string[];
}): Promise<string | null> {
  const {
    TeleportRepoMismatchDialog
  } = await import('./components/TeleportRepoMismatchDialog.js');
  return showSetupDialog<string | null>(root, done => createElement(TeleportRepoMismatchDialog,{targetRepo:props.targetRepo,initialPaths:props.initialPaths,onSelectPath:done,onCancel:()=>done(null)}));
}

/**
 * The former terminal resume picker was retired with Ink REPL.
 * The desktop history page owns session selection and resumption.
 */
export async function launchResumeChooser(
  _root: Root,
  _appProps: {
    getFpsMetrics: () => FpsMetrics | undefined
    stats: StatsStore
    initialState: AppState
  },
  _worktreePathsPromise: Promise<string[]>,
  _resumeProps: unknown,
): Promise<void> {
  const { launchDesktopFromCli } = await import('./cli/desktop/launch.ts')
  process.exitCode = await launchDesktopFromCli({
    argv: ['--desktop', '--resume'],
    options: { resume: true },
  })
}
