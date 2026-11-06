import { feature } from 'bun:bundle';
import { rejectDeepLinkArgumentInjection } from '../utils/cliArgv317.ts';
import { classifyStartupArgs } from './startupRouting317.ts';
import { adoptRunnerDeclaration } from './runnerDeclaration317.ts';
import { noteProcessStartTuning, startGarbageCollectionCount } from '../bootstrap/processStart317.ts';
import { scheduleJitPolicy317 } from '../bootstrap/jitPolicy317.ts';
import { guardRelayTokenDescriptor317, guardRunnerReviewTokens317 } from '../bootstrap/relayTokenGuard317.ts';
import { randomUUID } from 'node:crypto';
import { getStartupCwdError, writeStartupFailureResult, reportCliStartupFailure } from '../utils/cliStartupFailure.ts';

// Apply Windows executable-search protection before fast-path process launches.
// eslint-disable-next-line custom-rules/no-top-level-side-effects
process.env.NoDefaultCurrentDirectoryInExePath = '1';
// Prevent corepack from adding yarnpkg to project package.json files.
// eslint-disable-next-line custom-rules/no-top-level-side-effects
process.env.COREPACK_ENABLE_AUTO_PIN = '0';

// Set max heap size for child processes in CCR environments (containers have 16GB)
// eslint-disable-next-line custom-rules/no-top-level-side-effects, custom-rules/no-process-env-top-level, custom-rules/safe-env-boolean-check
if (process.env.CLAUDE_CODE_REMOTE === 'true') {
  // eslint-disable-next-line custom-rules/no-top-level-side-effects, custom-rules/no-process-env-top-level
  const existing = process.env.NODE_OPTIONS || '';
  // eslint-disable-next-line custom-rules/no-top-level-side-effects, custom-rules/no-process-env-top-level
  process.env.NODE_OPTIONS = existing ? `${existing} --max-old-space-size=8192` : '--max-old-space-size=8192';
}

// Harness-science L0 ablation baseline. Inlined here (not init.ts) because
// BashTool/AgentTool/PowerShellTool capture DISABLE_BACKGROUND_TASKS into
// module-level consts at import time — init() runs too late. feature() gate
// DCEs this entire block from external builds.
// eslint-disable-next-line custom-rules/no-top-level-side-effects, custom-rules/no-process-env-top-level
if (feature('ABLATION_BASELINE') && process.env.CLAUDE_CODE_ABLATION_BASELINE) {
  for (const k of ['CLAUDE_CODE_SIMPLE', 'CLAUDE_CODE_DISABLE_THINKING', 'DISABLE_INTERLEAVED_THINKING', 'DISABLE_COMPACT', 'DISABLE_AUTO_COMPACT', 'CLAUDE_CODE_DISABLE_AUTO_MEMORY', 'CLAUDE_CODE_DISABLE_BACKGROUND_TASKS']) {
    // eslint-disable-next-line custom-rules/no-top-level-side-effects, custom-rules/no-process-env-top-level
    process.env[k] ??= '1';
  }
}

/**
 * Bootstrap entrypoint - checks for special flags before loading the full CLI.
 * All imports are dynamic to minimize module evaluation for fast paths.
 * The version fast path loads only the startup guards, without the full CLI.
 */
async function main(): Promise<void> {
  // The original 317 invokes this protection before argv scanning, profiler,
  // config access and remote MCP service initialization.
  await guardRelayTokenDescriptor317();
  // Official 317: this launch-only first argument is removed before URI/CLI
  // parsing. Its state is adopted after cwd validation and before profiler/
  // regular CLI initialization, with no change for unrecognized declarations.
  const runnerArg = process.argv[2]?.startsWith('--runner-declares=')
    ? process.argv.splice(2, 1)[0]
    : undefined;
  const args = process.argv.slice(2);
  const injectionError = rejectDeepLinkArgumentInjection(args);
  if (injectionError) {
    process.stderr.write(injectionError + '\n');
    process.exitCode = 1;
    return;
  }
  // Self-hosted code-review workers have a separate credential-bearing
  // startup route. The original 317 checks it after URI validation but
  // before process policy, profiling and CLI module initialization.
  await guardRunnerReviewTokens317();
  // Original 2.1.317 startup records one-shot allocator flags and only
  // starts remote GC profiling when explicitly enabled, before --version.
  noteProcessStartTuning();
  startGarbageCollectionCount();
  const { desktopRequest, backgroundFlagRequest, helpRequest, bareRequest, backgroundRequest, sessionVerbIndex, tmuxWorktreeRequest } = classifyStartupArgs(args);

  // Fast-path for --version/-v: avoid evaluating the full CLI.
  // The 2.1.317 native executable accepts --version --verbose before full
  // configuration/bootstrap and identifies its pinned upstream source commit.
  const verboseVersion = args.length === 2 && args[1] === '--verbose';
  if ((args.length === 1 || verboseVersion) &&
      (args[0] === '--version' || args[0] === '-v' || args[0] === '-V')) {
    // MACRO.VERSION is inlined at build time.
    // biome-ignore lint/suspicious/noConsole:: intentional console output
    console.log(`${MACRO.VERSION} (333)`);
    if (verboseVersion) {
      // Independently verified against the official 2.1.317 Linux x64 binary.
      console.log('Commit: 3d3e7cb16b5577dccaee9520c8dc1189d02d61b7');
    }
    return;
  }

  const cwdError = getStartupCwdError();
  if (cwdError) {
    process.stderr.write(cwdError + '\n');
    await writeStartupFailureResult({ sessionId: randomUUID(), message: cwdError, reason: 'cwd_unavailable' });
    process.exitCode = 1;
    return;
  }

  if (runnerArg !== undefined) {
    // Official 317 cli.js passes every recognized runner launch declaration
    // through one parser, which decides which capabilities are adopted.
    const state = await import('../bootstrap/state.js');
    adoptRunnerDeclaration(runnerArg, state);
  }

  // For all other paths, load the startup profiler
  const {
    profileCheckpoint
  } = await import('../utils/startupProfiler.js');
  profileCheckpoint('cli_entry');
  // Original 317 postpones JIT for ordinary launches, never for warmed spares.
  if (args[0] !== '--preload' && args[0] !== '--bg-spare') scheduleJitPolicy317({ args });

  // Upstream 2.1.317 routes plugin test before Commander/REPL initialization.
  // Keep test workers out of session, plugin marketplace and UI startup paths.
  if (args[0] === 'plugin' && args[1] === 'test') {
    profileCheckpoint('cli_plugin_test_path');
    const { runPluginTestFastPath317 } = await import('./pluginTestFastPath317.ts');
    if (await runPluginTestFastPath317(args.slice(2))) return;
  }

  // Official 317 cli.js:429-459 dispatches self-hosted runner before REPL.
  // Keep host registration, worker credentials and process lifecycle isolated.
  if (args[0] === 'self-hosted-runner') {
    profileCheckpoint('cli_self_hosted_runner_path');
    try {
      const operation = args[1];
      switch (operation) {
        case 'orchestrator': {
          const { selfHostedRunnerOrchestratorMain317 } =
            await import('../cli/selfHostedRunner/orchestrator317.ts');
          await selfHostedRunnerOrchestratorMain317(args.slice(2));
          break;
        }
        case 'setup': {
          const { selfHostedRunnerSetupMain317 } =
            await import('../cli/selfHostedRunner/setup317.ts');
          await selfHostedRunnerSetupMain317(args.slice(2));
          break;
        }
        case 'doctor': {
          const { selfHostedRunnerDoctorMain317 } =
            await import('../cli/selfHostedRunner/doctor317.ts');
          await selfHostedRunnerDoctorMain317(args.slice(2));
          break;
        }
        case 'code-sign': {
          const { selfHostedRunnerCodeSignMain317 } =
            await import('../cli/selfHostedRunner/codeSign317.ts');
          await selfHostedRunnerCodeSignMain317(args.slice(2));
          break;
        }
        case 'decode-token': {
          const { selfHostedRunnerDecodeTokenMain317 } =
            await import('../cli/selfHostedRunner/decodeToken317.ts');
          await selfHostedRunnerDecodeTokenMain317(args.slice(2));
          break;
        }
        default: {
          const { selfHostedRunnerMain317 } = await import('../cli/selfHostedRunner/runnerHost317.ts');
          await selfHostedRunnerMain317(args.slice(1));
        }
      }
    } catch (error) {
      const usage = error instanceof Error && error.name === 'RunnerUsageError317';
      const jwtError = args[1] === 'decode-token' && error instanceof Error;
      if (jwtError) {
        process.stderr.write(error.message + '\n');
        process.exitCode = 1;
      } else if (usage) {
        process.stderr.write('error: ' + error.message +
          "\nRun '333 self-hosted-runner --help' for usage.\n");
        process.exitCode = 2;
      } else {
        process.stderr.write('self-hosted-runner: ' +
          (error instanceof Error ? error.message : String(error)) + '\n');
        process.exitCode = 1;
      }
    }
    return;
  }

  // Official 2.1.317 runs the eval MCP stand-in independently of the REPL,
  // before chrome, daemon and background-session routing.
  if (args[0] === '--eval-mock-server') {
    profileCheckpoint('cli_eval_mock_server_path');
    const { runEvalMockServer317 } = await import('../bootstrap/evalMockServer317.ts');
    try {
      await runEvalMockServer317(args[1], args[2]);
    } catch (error) {
      process.stderr.write('--eval-mock-server: ' +
        (error instanceof Error ? error.message : String(error)) + '\n');
      process.exitCode = 1;
    }
    return;
  }

  // Official 317 calls ensureFastPathSettingsLoaded before dedicated workers.
  // These routes bypass Commander's ordinary preAction settings initialization.
  const ensureWorkerStartupPolicy = async (route: string, ptySupervisor = false): Promise<boolean> => {
    try {
      const { ensureFastPathSettingsLoaded317, checkRequiredFastPathVersion317,
        enforcesRequiredVersionForWorker317 } =
        await import('../bootstrap/fastPathSettings317.ts');
      const policy = await ensureFastPathSettingsLoaded317();
      if (enforcesRequiredVersionForWorker317(route)) {
        const refusal = checkRequiredFastPathVersion317(MACRO.VERSION, policy);
        if (refusal) {
          process.stderr.write(refusal + '\n');
          process.exitCode = 1;
          return false;
        }
      }
      return true;
    } catch (error) {
      if (!ptySupervisor) throw error;
      // Upstream PTY supervisor keeps running when settings bootstrap fails;
      // the parent has already applied the process-level admission gate.
      process.stderr.write(
        'ptyHost: settings bootstrap threw (continuing; supervisor already gated): ' +
        (error instanceof Error ? error.stack ?? error.message : String(error)) + '\n'
      );
      return true;
    }
  };

  // Native PTY host bypasses interactive REPL and exchanges binary frames.
  if (args[0] === '--bg-pty-host') {
    if (!await ensureWorkerStartupPolicy('--bg-pty-host', true)) return;
    const { runPtyHost317 } = await import('../bootstrap/ptyHost317.ts');
    process.exitCode = await runPtyHost317(args.slice(1));
    return;
  }

  // 317 daemon worker reads JSON from stdin and runs without REPL/PTY imports.
  if (args[0] === '--daemon-worker') {
    if (!await ensureWorkerStartupPolicy('--daemon-worker')) return;
    // The original daemon restores network/session facts before worker-kind
    // validation. A malformed active proxy must exit 78, even for unknown kinds.
    const { checkDaemonStartupProxy317 } = await import('../bootstrap/daemonProxy317.ts');
    const proxyRefusal = checkDaemonStartupProxy317();
    if (proxyRefusal) {
      process.stderr.write(proxyRefusal + '\n');
      process.exitCode = 78;
      return;
    }
    // sessionFactsRestored installs the proxy/mTLS dispatchers before a
    // daemon worker can access a remote endpoint.
    const { configureGlobalAgents } = await import('../utils/proxy.js');
    configureGlobalAgents();
    const { runDaemonWorker317 } = await import('../bootstrap/daemonWorker317.ts');
    process.exitCode = await runDaemonWorker317(args[1]);
    return;
  }

  // 317 warm background spare accepts one authenticated socket claim, then runs the CLI.
  if (args[0] === '--bg-spare') {
    if (!await ensureWorkerStartupPolicy('--bg-spare')) return;
    const { runBgSpare317 } = await import('../bootstrap/bgSpare317.ts');
    process.exitCode = await runBgSpare317(args.slice(1));
    return;
  }

  // 317 remote preloader is a one-shot socket claim that must run before
  // importing the interactive CLI or starting background session services.
  if (args[0] === '--preload') {
    if (!await ensureWorkerStartupPolicy('--preload')) return;
    const { runPreload317 } = await import('../bootstrap/preload317.ts');
    await runPreload317(args.slice(1));
    return;
  }

  // Official 317 rejects desktop/background combinations before opening Desktop.
  // Check root-option-prefixed session verbs too (e.g. --settings={} logs deadbeef).
  if (desktopRequest && (sessionVerbIndex !== -1 || backgroundFlagRequest)) {
    const verb = sessionVerbIndex !== -1 ? args[sessionVerbIndex] : undefined;
    process.stderr.write(verb
      ? `--desktop can't be combined with \`claude ${verb}\`.\n`
      : "--desktop opens the Claude Desktop app and can't run in the background (`--bg`, `--background`, `--routine`).\n");
    process.exitCode = 1;
    return;
  }

  // Desktop is a one-shot native handoff, not an interactive REPL. Handle it
  // before main.tsx initializes terminal listeners and startup background tasks:
  // those tasks otherwise keep error paths alive after their message is printed.
  if (desktopRequest && !helpRequest) {
    const { parseDesktopCliOptions, launchDesktopFromCli } =
      await import('../cli/desktop/launch.ts');
    const { prompt, options } = parseDesktopCliOptions(args);
    process.exitCode = await launchDesktopFromCli({ prompt, options, argv: args });
    return;
  }

  // Official 2.1.310 background agent fleet uses a dedicated fast path.
  // Keep supervisor and PTY workers outside regular interactive REPL initialization.
  if (backgroundRequest) {
    const { interceptBackgroundCli } = await import('../cli/background/index.ts');
    try {
      const { ensureFastPathSettingsLoaded317, checkRequiredFastPathVersion317,
        backgroundVersionDisposition317 } = await import('../bootstrap/fastPathSettings317.ts');
      const route = sessionVerbIndex !== -1 ? args[sessionVerbIndex]! : args[0] ?? '';
      const admission = backgroundVersionDisposition317(route);
      const policy = await ensureFastPathSettingsLoaded317();
      if (admission !== 'skip') {
        const refusal = checkRequiredFastPathVersion317(MACRO.VERSION, policy);
        if (refusal) {
          process.stderr.write(refusal + '\n');
          if (admission === 'reject') {
            process.exitCode = 1;
            return;
          }
        }
      }
      if (await interceptBackgroundCli(args)) return;
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
      return;
    }
  }

  // Fast-path for --dump-system-prompt: output the rendered system prompt and exit.
  // Used by prompt sensitivity evals to extract the system prompt at a specific commit.
  // Ant-only: eliminated from external builds via feature flag.
  if (feature('DUMP_SYSTEM_PROMPT') && args[0] === '--dump-system-prompt') {
    profileCheckpoint('cli_dump_system_prompt_path');
    const {
      enableConfigs
    } = await import('../utils/config.js');
    enableConfigs();
    const {
      getMainLoopModel
    } = await import('../utils/model/model.js');
    const modelIdx = args.indexOf('--model');
    const model = modelIdx !== -1 && args[modelIdx + 1] || getMainLoopModel();
    const {
      getSystemPrompt
    } = await import('../constants/prompts.js');
    const prompt = await getSystemPrompt([], model);
    // biome-ignore lint/suspicious/noConsole:: intentional console output
    console.log(prompt.join('\n'));
    return;
  }
  if (process.argv[2] === '--claude-in-chrome-mcp') {
    profileCheckpoint('cli_claude_in_chrome_mcp_path');
    const {
      runClaudeInChromeMcpServer
    } = await import('../utils/claudeInChrome/mcpServer.js');
    await runClaudeInChromeMcpServer();
    return;
  } else if (process.argv[2] === '--chrome-native-host') {
    profileCheckpoint('cli_chrome_native_host_path');
    const {
      runChromeNativeHost
    } = await import('../utils/claudeInChrome/chromeNativeHost.js');
    await runChromeNativeHost();
    return;
  } else if (feature('CHICAGO_MCP') && process.argv[2] === '--computer-use-mcp') {
    profileCheckpoint('cli_computer_use_mcp_path');
    const {
      runComputerUseMcpServer
    } = await import('../utils/computerUse/mcpServer.js');
    await runComputerUseMcpServer();
    return;
  }

  // Fast-path for `claude remote-control` (also accepts legacy `claude remote` / `claude sync` / `claude bridge`):
  // serve local machine as bridge environment.
  // feature() must stay inline for build-time dead code elimination;
  // isBridgeEnabled() checks the runtime GrowthBook gate.
  if (feature('BRIDGE_MODE') && (args[0] === 'remote-control' || args[0] === 'rc' || args[0] === 'remote' || args[0] === 'sync' || args[0] === 'bridge')) {
    profileCheckpoint('cli_bridge_path');
    const {
      enableConfigs
    } = await import('../utils/config.js');
    enableConfigs();
    const {
      getBridgeDisabledReason,
      checkBridgeMinVersion,
      isRemoteControlDisabledBySettings
    } = await import('../bridge/bridgeEnabled.js');
    const {
      BRIDGE_LOGIN_ERROR
    } = await import('../bridge/types.js');
    const {
      bridgeMain
    } = await import('../bridge/bridgeMain.js');
    const {
      exitWithError
    } = await import('../utils/process.js');

    // Auth check must come before the GrowthBook gate check — without auth,
    // GrowthBook has no user context and would return a stale/default false.
    // getBridgeDisabledReason awaits GB init, so the returned value is fresh
    // (not the stale disk cache), but init still needs auth headers to work.
    const {
      getClaudeAIOAuthTokens
    } = await import('../utils/auth.js');
    if (isRemoteControlDisabledBySettings()) {
      exitWithError('Error: Remote Control is disabled by the disableRemoteControl setting.');
    }
    if (!getClaudeAIOAuthTokens()?.accessToken) {
      exitWithError(BRIDGE_LOGIN_ERROR);
    }
    const disabledReason = await getBridgeDisabledReason();
    if (disabledReason) {
      exitWithError(`Error: ${disabledReason}`);
    }
    const versionError = checkBridgeMinVersion();
    if (versionError) {
      exitWithError(versionError);
    }

    // Bridge is a remote control feature - check policy limits
    const {
      waitForPolicyLimitsToLoad,
      isPolicyAllowed
    } = await import('../services/policyLimits/index.js');
    await waitForPolicyLimitsToLoad();
    if (!isPolicyAllowed('allow_remote_control')) {
      exitWithError("Error: Remote Control is disabled by your organization's policy.");
    }
    await bridgeMain(args.slice(1));
    return;
  }

  // The public 2.1.310 CLI uses its current commands; the experimental
  // legacy TEMPLATES new/list/reply dispatch has no release entrypoint.

  // Fast-path for --worktree --tmux: exec into tmux before loading full CLI
  if (tmuxWorktreeRequest) {
    profileCheckpoint('cli_tmux_worktree_fast_path');
    const {
      enableConfigs
    } = await import('../utils/config.js');
    enableConfigs();
    const {
      isWorktreeModeEnabled
    } = await import('../utils/worktreeModeEnabled.js');
    if (isWorktreeModeEnabled()) {
      const {
        execIntoTmuxWorktree
      } = await import('../utils/worktree.js');
      const result = await execIntoTmuxWorktree(args);
      if (result.handled) {
        return;
      }
      // If not handled (e.g., error), fall through to normal CLI
      if (result.error) {
        const {
          exitWithError
        } = await import('../utils/process.js');
        exitWithError(result.error);
      }
    }
  }

  // Redirect common update flag mistakes to the update subcommand
  if (args.length === 1 && (args[0] === '--update' || args[0] === '--upgrade')) {
    process.argv = [process.argv[0]!, process.argv[1]!, 'update'];
  }

  // --bare: set SIMPLE early so gates fire during module eval / commander
  // option building (not just inside the action handler).
  if (bareRequest) {
    process.env.CLAUDE_CODE_SIMPLE = '1';
  }

  // No special flags detected, load and run the full CLI
  const {
    startCapturingEarlyInput
  } = await import('../utils/earlyInput.js');
  startCapturingEarlyInput();
  profileCheckpoint('cli_before_main_import');
  const {
    main: cliMain
  } = await import('../main.js');
  profileCheckpoint('cli_after_main_import');
  await cliMain();
  profileCheckpoint('cli_after_main_complete');
}

// eslint-disable-next-line custom-rules/no-top-level-side-effects
void main().catch(reportCliStartupFailure);
