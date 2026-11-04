/**
 * Standalone Claude Code 2.1.317 cloud review CLI. Uses the same session
 * creation, repository detection, quota and event transport as the existing
 * interactive /ultrareview; no separate local review implementation.
 */
import axios from 'axios'
import { setTimeout as sleepTimer } from 'node:timers/promises'
import { createInterface } from 'node:readline/promises'
import { execFileNoThrow } from '../../utils/execFileNoThrow.js'
import { getDefaultBranch, gitExe } from '../../utils/git.js'
import { getOauthConfig } from '../../constants/oauth.js'
import { checkHasTrustDialogAccepted } from '../../utils/config.js'
import { checkRemoteAgentEligibility, formatPreconditionError } from '../../tasks/RemoteAgentTask/RemoteAgentTask.js'
import { checkOverageGate } from '../../commands/review/reviewRemote.js'
import { getUltrareviewRuntimeEnvironment } from '../../utils/review/ultrareviewRuntime.js'
import { resolveUltrareviewGitBase } from '../../utils/review/ultrareviewGitBase.mjs'
import { detectCurrentRepositoryWithHost } from '../../utils/detectRepository.js'
import { getClaudeAIOAuthTokens } from '../../utils/auth.js'
import { pollRemoteSessionEvents, teleportToRemote } from '../../utils/teleport.js'
import { prepareApiRequest, getOAuthHeaders, isTransientNetworkError } from '../../utils/teleport/api.js'
import { REMOTE_REVIEW_PROGRESS_TAG } from '../../constants/xml.js'
import { extractTag, textOfReviewEvent, extractLatestRemoteReview, formatRemoteReviewFindings } from './ultrareviewProtocol.mjs'

export type UltrareviewCliOptions = {
  json?: boolean
  post?: boolean
  timeout?: string
  trustWorkspace?: boolean
}
const ENV_ID = 'env_011111111111111111111113'
const MAX_FAILED_POLLS = 5
const POLL_INTERVAL_MS = 3000
/** Keep CLI errors on stderr and let Commander unwind normally. */
function fail(message: string): void {
  process.stderr.write(message + '\n')
  process.exitCode = 1
}
function outputError(message: string): void {
  // The official 2.1.317 standalone CLI prefixes launch failures, including
  // the no-credential branch; workspace trust failures use fail() directly.
  fail('Ultrareview could not launch: ' + message)
}
function isPrNumber(target: string): boolean {
  return /^[1-9]\d*$/.test(target)
}
/** Abort-aware delay: cancellation must interrupt remote polling promptly. */
async function sleep(ms: number, signal: AbortSignal): Promise<void> {
  await sleepTimer(ms, undefined, { signal })
}
function startupFailure(messages: unknown[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const e = messages[i] as Record<string, unknown> | undefined
    if (e?.type === 'result' && e.is_error === true) return 'Cloud review returned an error'
  }
}
async function pollReview(sessionId: string, deadline: number, signal: AbortSignal): Promise<string> {
  const messages: unknown[] = []
  let cursor: string | null = null
  let consecutiveFailures = 0
  let progress = ''
  while (Date.now() < deadline) {
    if (signal.aborted) throw new Error('interrupted')
    try {
      const response = await pollRemoteSessionEvents(sessionId, cursor)
      cursor = response.lastEventId ?? cursor
      consecutiveFailures = 0
      messages.push(...response.newEvents)
      for (const event of response.newEvents) {
        const update = extractTag(textOfReviewEvent(event), REMOTE_REVIEW_PROGRESS_TAG)
        if (update && update !== progress) {
          progress = update
          process.stderr.write('  ' + update + '\n')
        }
      }
      const found = extractLatestRemoteReview(messages)
      if (found) return found
      if (response.sessionStatus === 'archived') {
        throw new Error('cloud session was archived before producing output')
      }
      const failure = startupFailure(messages)
      if (failure) throw new Error(failure)
    } catch (error) {
      if (signal.aborted) throw error
      // A closed session must surface immediately; only transport failure
      // is retried and never more than five times.
      if (!isTransientNetworkError(error)) throw error
      if (++consecutiveFailures >= MAX_FAILED_POLLS) {
        throw new Error('lost connection to the cloud session after repeated retries', { cause: error })
      }
    }
    await sleep(POLL_INTERVAL_MS, signal)
  }
  throw new Error('cloud session exceeded the configured timeout')
}
async function postReview(sessionId: string): Promise<void> {
  const { accessToken, orgUUID } = await prepareApiRequest()
  const url = getOauthConfig().BASE_API_URL + '/v1/code/github/post-review-comment'
  const deadline = Date.now() + 90_000
  for (;;) {
    const response = await axios.post(url, { session_id: sessionId }, {
      headers: { ...getOAuthHeaders(accessToken), 'x-organization-uuid': orgUUID },
      timeout: 60_000,
      validateStatus: () => true,
    })
    if (response.status >= 200 && response.status < 300 &&
      typeof response.data?.comment_url === 'string') {
      process.stderr.write((response.data.already_posted ? 'Already posted — ' : 'Posted — ') +
        'a single plain comment, not a review: ' + response.data.comment_url + '\n')
      return
    }
    if (response.data?.error?.reason !== 'findings_pending' || Date.now() + 15_000 >= deadline) {
      process.stderr.write('Findings could not be posted to the pull request: ' +
        (response.data?.error?.message ?? 'HTTP ' + response.status) + '\n')
      return
    }
    await sleep(5000, AbortSignal.timeout(15_000))
  }
}
async function confirmWorkspaceTrust(): Promise<boolean> {
  if (process.stdin.isTTY && process.stdout.isTTY) {
    const rl = createInterface({ input: process.stdin, output: process.stderr })
    try {
      const answer = await rl.question('Ultrareview runs git in this folder. Trust this workspace for this run? [y/N] ')
      return /^y(?:es)?$/i.test(answer.trim())
    } finally { rl.close() }
  }
  return false
}
export async function ultrareviewCliHandler(target: string | undefined, options: UltrareviewCliOptions): Promise<void> {
  const argv = process.argv
  const trustIndex = argv.indexOf('--trust-workspace')
  const afterTrust = trustIndex >= 0 ? argv[trustIndex + 1] : undefined
  if (options.trustWorkspace && afterTrust && !afterTrust.startsWith('-')) {
    return fail('Ultrareview did not start: ' + 
      String.fromCharCode(96) + '--trust-workspace' + String.fromCharCode(96) +
      ' takes no value, but "' + afterTrust + '" follows it. If you do not trust this folder, leave the flag out. ' +
      'To trust it for this run, put nothing after the flag: a PR number or base branch goes before it.')
  }
  if (!options.trustWorkspace && !checkHasTrustDialogAccepted()) {
    if (!await confirmWorkspaceTrust()) {
      return fail('Error: Workspace not trusted. Please run ' +
        String.fromCharCode(96) + 'claude' + String.fromCharCode(96) +
        ' in ' + process.cwd() + ' first to review and accept the workspace trust dialog. ' +
        'Or, in a script or CI job, pass ' + String.fromCharCode(96) + '--trust-workspace' +
        String.fromCharCode(96) + ' to trust the folder for this run only.')
    }
  }
  if (!getClaudeAIOAuthTokens()?.accessToken) {
    return outputError('Ultrareview is currently unavailable.')
  }
  const eligibility = await checkRemoteAgentEligibility()
  if (!eligibility.eligible) {
    const reasons = eligibility.errors.filter(e => e.type !== 'no_remote_environment')
    if (reasons.length) return outputError(reasons.map(formatPreconditionError).join('\n'))
  }
  const gate = await checkOverageGate()
  if (gate.kind === 'not-enabled') return outputError(
    'Free ultrareviews used. Enable Extra Usage at https://claude.ai/settings/billing to continue.')
  if (gate.kind === 'low-balance') return outputError(
    'Balance too low to launch ultrareview ($' + gate.available.toFixed(2) +
    ' available, $10 minimum). Top up at https://claude.ai/settings/billing')
  if (gate.kind === 'needs-confirm') {
    if (!process.stdin.isTTY) return outputError('Extra Usage billing requires confirmation in a terminal.')
    const rl = createInterface({ input: process.stdin, output: process.stderr })
    try {
      const response = await rl.question('This ultrareview will bill as Extra Usage. Continue? [y/N] ')
      if (!/^y(?:es)?$/i.test(response.trim())) return fail('Ultrareview cancelled.')
    } finally { rl.close() }
  }
  const signal = new AbortController()
  let sessionId: string | undefined
  const interrupt = () => signal.abort(new Error('interrupted'))
  process.once('SIGINT', interrupt)
  try {
    let session
    if (target && isPrNumber(target)) {
      const repo = await detectCurrentRepositoryWithHost()
      if (!repo || repo.host !== 'github.com') return outputError('The selected pull request requires a GitHub repository.')
      session = await teleportToRemote({
        initialMessage: null, description: 'ultrareview: ' + repo.owner + '/' + repo.name + '#' + target,
        signal: signal.signal, branchName: 'refs/pull/' + target + '/head',
        environmentId: ENV_ID,
        environmentVariables: { BUGHUNTER_PR_NUMBER: target,
          BUGHUNTER_REPOSITORY: repo.owner + '/' + repo.name, ...getUltrareviewRuntimeEnvironment() },
      })
    } else {
      const branch = target || await getDefaultBranch() || 'main'
      const base = await resolveUltrareviewGitBase(
        branch, (args, input) => execFileNoThrow(gitExe(), args, {
          preserveOutputOnError: false,
          ...(input !== undefined && { input }),
        }),
      )
      if (base.kind === 'no-commits') return outputError('The repository has no commits to review.')
      if (base.kind === 'invalid-empty-tree') {
        return outputError('Could not construct an empty-tree comparison for the review.')
      }
      if (base.kind === 'all-files') {
        // Expanding scope to the full repository needs a separate, explicit
        // human decision, even if workspace trust has already been granted.
        if (!process.stdin.isTTY || !process.stderr.isTTY) {
          return outputError('No common Git history with ' + branch + '. All-file review needs confirmation in a terminal.')
        }
        const rl = createInterface({ input: process.stdin, output: process.stderr })
        let confirmed = false
        try {
          const answer = await rl.question(
            'No common history with ' + branch + '. Review and upload all tracked files as a single snapshot? [y/N] ',
          )
          confirmed = /^y(?:es)?$/i.test(answer.trim())
        } finally { rl.close() }
        if (!confirmed) return fail('Ultrareview cancelled.')
      }
      const comparisonBase = base.base
      const forceAllFiles = base.forceAllFiles
      const diff = await execFileNoThrow(gitExe(), ['diff', '--shortstat', comparisonBase], { preserveOutputOnError: false })
      if (diff.code !== 0) return outputError('Could not compare the current worktree with the review base.')
      if (!diff.stdout.trim()) return outputError('No changes against the ' + branch + ' fork point.')
      session = await teleportToRemote({
        initialMessage: null, description: 'ultrareview: ' + branch,
        signal: signal.signal, useBundle: true, environmentId: ENV_ID,
        ...(forceAllFiles && { bundleForceScope: 'squashed' as const }),
        environmentVariables: { BUGHUNTER_BASE_BRANCH: comparisonBase, ...getUltrareviewRuntimeEnvironment() },
      })
    }
    if (!session) return outputError('The cloud session could not start.')
    sessionId = session.id
    process.stderr.write('Ultrareview launched. Waiting for findings…\n')
    const minutes = Number(options.timeout)
    const timeout = options.timeout && Number.isFinite(minutes) && minutes > 0 ? minutes : 45
    const raw = await pollReview(session.id, Date.now() + timeout * 60_000, signal.signal)
    const parsed = options.json ? raw : formatRemoteReviewFindings(raw)
    process.stdout.write(parsed + '\n')
    if (options.post) {
      if (!target || !isPrNumber(target)) {
        process.stderr.write('Findings were generated, but --post only applies to a pull-request target.\n')
      } else {
        process.stderr.write('Posting the findings to the pull request as a comment from your GitHub account…\n')
        try {
          await postReview(session.id)
        } catch (error) {
          process.stderr.write('Findings were produced, but posting did not finish: ' +
            (error instanceof Error ? error.message : String(error)) + '\n')
        }
      }
    }
    process.exit(0)
  } catch (error) {
    if (signal.signal.aborted) {
      process.stderr.write('Stopped waiting. The review may still be running in the cloud.\n')
      process.exit(130)
    }
    return fail('Ultrareview failed: ' + (error instanceof Error ? error.message : String(error)) +
      (sessionId ? '\nThe cloud session may still be running.' : ''))
  } finally {
    process.removeListener('SIGINT', interrupt)
  }
}
