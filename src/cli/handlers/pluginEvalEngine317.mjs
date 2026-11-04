/**
 * 2.1.317 plugin evaluation engine: per-case model calls, optional baseline
 * arm, weighted graders and budget accounting. Model invocation is injectable
 * for deterministic tests; production calls the rebuilt Claude CLI.
 */
import { mkdtemp, rm, readFile, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, relative, isAbsolute } from 'node:path'
import { gradeEvalResult317, aggregateEvalScore317 } from './pluginEvalGraders317.mjs'
import { runEvalModel317, judgeEvalOutput317 } from './pluginEvalModel317.mjs'

export async function executePluginEvalSuite317(cases, settings, adapters = {}) {
  const runModel = adapters.runModel ?? runEvalModel317
  const judge = adapters.judge ?? judgeEvalOutput317
  const ablation = settings.ablation ?? 'with-without'
  if (ablation !== 'none' && ablation !== 'with-without') throw new Error('Invalid eval ablation mode')
  const concurrency = Number(settings.concurrency ?? 1)
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
    throw new Error('Eval concurrency must be 1–8')
  }
  const maxCostUsd = settings.maxCostUsd === undefined ? Infinity : Number(settings.maxCostUsd)
  if (Number.isNaN(maxCostUsd) || maxCostUsd < 0) throw new Error('Invalid eval cost ceiling')
  const jobs = []
  for (const one of cases) {
    const runs = Number(settings.runs ?? one.runs)
    if (!Number.isInteger(runs) || runs < 1 || runs > 50) throw new Error('Eval runs must be 1–50')
    for (let repeat = 1; repeat <= runs; repeat++) {
      jobs.push({ caseInfo: one, repeat, arm: 'with' })
      if (ablation === 'with-without') jobs.push({ caseInfo: one, repeat, arm: 'without' })
    }
  }
  const completed = new Array(jobs.length)
  let index = 0, costUsd = 0, budgetExceeded = false
  async function work() {
    while (true) {
      if (budgetExceeded) return
      const next = index++
      if (next >= jobs.length) return
      const job = jobs[next]
      const workspace = await mkdtemp(join(tmpdir(), 'claude-plugin-eval-317-'))
      try {
        const result = await runModel({
          prompt: job.caseInfo.execution.prompt,
          workspace,
          pluginDir: job.arm === 'with' ? settings.pluginRoot : undefined,
          model: settings.model ?? job.caseInfo.execution.model,
          timeoutSeconds: job.caseInfo.execution.timeout_seconds,
          allowedTools: settings.allowedTools ?? job.caseInfo.execution.allowed_tools ?? [],
          disallowedTools: [...(job.caseInfo.execution.disallowed_tools ?? []),
            ...(settings.disallowedTools ?? [])],
          maxBudgetUsd: Number.isFinite(maxCostUsd) ? Math.max(0, maxCostUsd - costUsd) : undefined,
          maxTurns: job.caseInfo.execution.max_turns,
          env: job.caseInfo.execution.env ?? {},
        })
        const actual = {
          workspace,
          lastMessage: result.lastMessage ?? '',
          trace: result.trace ?? [],
          mockCalls: result.mockCalls ?? [],
        }
        const verdicts = []
        let judgeCostUsd = 0
        for (const grader of job.caseInfo.graders) {
          if (job.arm === 'without' && grader.arm === 'with-only') continue
          let verdict
          if (result.error) {
            // A model failure cannot be promoted to success by an empty-output
            // regex or an expected-absent-file grader.
            verdict = { name: grader.name, type: grader.type,
              weight: grader.weight ?? 1, pass: false, score: 0, error: result.error }
          } else {
            if (grader.type === 'baseline') {
              const baseFile = resolve(job.caseInfo.dir, grader.baseline_file)
              const root = await realpath(job.caseInfo.dir)
              const resolvedFile = await realpath(baseFile)
              const rel = relative(root, resolvedFile)
              if (rel === '..' || rel.startsWith('../') || rel.startsWith('..\\') || isAbsolute(rel)) {
                throw new Error('baseline reference file escaped its case directory')
              }
              actual.baseline = await readFile(resolvedFile, 'utf8')
            }
            verdict = await gradeEvalResult317(grader, actual,
              async request => {
                const response = await judge(request, { workspace, judgeModel: settings.judgeModel })
                judgeCostUsd += Number(response?.costUsd ?? 0)
                return response
              })
          }
          const indicatorOnly = ablation === 'with-without' &&
            grader.type === 'tool_used' && grader.tool === 'Skill'
          verdicts.push({ ...verdict, indicatorOnly })
        }
        const summary = aggregateEvalScore317(verdicts)
        completed[next] = {
          name: job.caseInfo.name, arm: job.arm, repeat: job.repeat,
          ...summary, verdicts,
          output: result.lastMessage ?? '', trace: result.trace ?? [],
          error: result.error,
          costUsd: Number(result.costUsd ?? 0) + judgeCostUsd,
        }
        costUsd += Number(result.costUsd ?? 0) + judgeCostUsd
        if (costUsd >= maxCostUsd) budgetExceeded = true
      } finally {
        if (!settings.keepTemp) await rm(workspace, { recursive: true, force: true })
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, work))
  const reports = cases.map(c => {
    const runs = completed.filter(r => r?.name === c.name)
    const scores = runs.filter(r => r.score !== null).map(r => r.score)
    return {
      name: c.name, runs,
      score: scores.length ? scores.reduce((a,b) => a+b, 0) / scores.length : null,
    }
  })
  const scores = reports.filter(x => x.score !== null)
  return {
    version: '2.1.317',
    ablation, costUsd, budgetExceeded,
    cases: reports,
    score: scores.length ? scores.reduce((sum, x) => sum+x.score, 0) / scores.length : null,
  }
}
