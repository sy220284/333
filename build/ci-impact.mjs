#!/usr/bin/env node
/**
 * 主线 CI 按需路由：同一个 PR 的多个提交共用一个检查计划。
 * 累计起点取最近一次成功的统一验收；连续取消时追溯全部未验收改动。
 */
import { readFileSync, appendFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

export const CHECKS = Object.freeze(JSON.parse(
  readFileSync(new URL('./ci-paths.json', import.meta.url), 'utf8')
))
export const CHECK_NAMES = Object.freeze(Object.keys(CHECKS))
// These are large-scale acceptance suites; run only for review-ready PRs.
export const FULL_ONLY = new Set([
  'rebuild', 'latest-stable-six-host', 'm1-317-official-reference',
  'm1-evidence', 'm1-official-x64-installed-parity', 'm1-sdk-type-candidate',
])
// Broad historical filters made every small source change trigger expensive tasks.
const DRAFT_RULES = {
  codeql: ['src/security/**', 'src/auth/**', 'src/utils/permissions/**',
    'src/services/api/**', '.github/codeql/**', '.github/workflows/codeql.yml'],
  'dev-quality': ['tools/dev/**', 'native/**', 'tests/**', 'package.json',
    'tsconfig.json', 'biome.json', '.github/workflows/dev-quality.yml'],
  'upgrade-direct-alignment': CHECKS['upgrade-direct-alignment'].filter(x => x !== 'src/**'),
  'upgrade-protection': ['package.json', 'tools/dev/**', 'src/services/mcp/**',
    'src/skills/**', 'tests/upgrade-protection.test.mjs', '.github/workflows/upgrade-protection.yml'],
}

export function globMatch(glob, path) {
  if (glob.startsWith('!')) return false
  let source = '^'
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*' && glob[i + 1] === '*') {
      if (glob[i + 2] === '/') { source += '(?:.*/)?'; i += 2 }
      else { source += '.*'; i++ }
    } else if (c === '*') source += '[^/]*'
    else if (c === '?') source += '[^/]'
    else source += c.replace(/[.*+?^$()|[\]{}\\]/g, '\\$&')
  }
  return new RegExp(source + '$').test(path)
}

export function routeChanges(files, full = false) {
  const result = Object.fromEntries(CHECK_NAMES.map(name => [name, Boolean(full)]))
  if (full) return result
  let specialistMatched = false
  for (const file of files) {
    for (const [name, patterns] of Object.entries(CHECKS)) {
      if (FULL_ONLY.has(name)) continue
      const rules = DRAFT_RULES[name] ?? patterns
      if (rules.some(pattern => globMatch(pattern, file))) {
        result[name] = true
        if (name !== 'governance-audit' && name !== 'dev-quality') specialistMatched = true
      }
    }
    // A workflow change must exercise its own gate, except for full-only suites.
    const matched = /^\.github\/workflows\/([^/]+)\.yml$/.exec(file)
    if (matched && Object.hasOwn(result, matched[1]) && !FULL_ONLY.has(matched[1])) {
      result[matched[1]] = true
      specialistMatched = true
    }
  }
  if (!specialistMatched && files.some(f => /^(src|tests|build|native)\//.test(f)))
    result['dev-quality'] = true
  if (files.some(f => /^(\.github\/workflows\/ci-on-demand\.yml|build\/ci-(?:impact\.mjs|paths\.json|gate-audit\.mjs)|tests\/ci-routing\.test\.mjs)$/.test(f))) {
    result['dev-quality'] = true
    result['dev-toolchain'] = true
  }
  return result
}

const validSha = sha => typeof sha === 'string' && /^[0-9a-f]{40}$/i.test(sha)
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
export function selectBaseline(runs, number, head, ancestor) {
  const relevant = runs.filter(run => run.event === 'pull_request' &&
    validSha(run.head_sha) && run.head_sha !== head &&
    (!run.pull_requests?.length || run.pull_requests.some(p => p.number === number)) &&
    ancestor(run.head_sha, head))
  const successful = relevant
    .filter(run => run.status === 'completed' && run.conclusion === 'success')
    .sort((a,b) => b.created_at.localeCompare(a.created_at))
  if (successful.length) return { sha: successful[0].head_sha, reason: 'last-success' }
  const pending = relevant.sort((a,b) => a.created_at.localeCompare(b.created_at))
  return pending.length ? { sha: pending[0].head_sha, reason: 'first-unverified-run' } : null
}

function ancestor(sha, head) {
  if (!validSha(sha)) return false
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', sha, head], { stdio:'ignore' })
    return true
  } catch { return false }
}

async function historicalRuns(event, token) {
  if (!token) throw Error('GITHUB_TOKEN 缺失；无法核实先前通过的 CI 检查')
  const repo = process.env.GITHUB_REPOSITORY
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo ?? '')) throw Error('GITHUB_REPOSITORY 无效')
  const output=[]
  for (let page=1;page<=5;page++) {
    const url='https://api.github.com/repos/' + repo +
      '/actions/workflows/ci-on-demand.yml/runs?event=pull_request&branch=' +
      encodeURIComponent(event.pull_request.head.ref) + '&per_page=100&page=' + page
    const response=await fetch(url,{headers:{
      Authorization:'Bearer ' + token, Accept:'application/vnd.github+json',
      'X-GitHub-Api-Version':'2022-11-28',
    }})
    if (response.status===404 && page===1) return {runs:[],complete:true}
    if (!response.ok) throw Error('读取历史 CI 检查失败：HTTP ' + response.status)
    const rows=(await response.json()).workflow_runs ?? []
    output.push(...rows)
    if (rows.length<100) return {runs:output,complete:true}
  }
  // If history is longer than the bounded query, use the entire PR diff.
  return {runs:output,complete:false}
}

function allPRChanges(event, head) {
  const base='refs/remotes/origin/' + event.pull_request.base.ref
  return git('merge-base', base, head)
}

export async function buildPlan(event, token, options={}) {
  if (!event.pull_request)
    return { full:true, files:[], baseline:'manual', routes:routeChanges([], true) }
  const head=event.pull_request.head.sha
  if (!validSha(head)) throw Error('PR 最新提交 SHA 无效')
  if (event.pull_request.draft===false)
    return { full:true, files:[], baseline:'review-ready', routes:routeChanges([], true) }
  const history=options.history ?? await historicalRuns(event,token)
  const ancestry=options.ancestor ?? ancestor
  const selection=history.complete
    ? selectBaseline(history.runs,event.pull_request.number,head,ancestry) : null
  let base=allPRChanges(event,head),label='full-pr-diff'
  if (selection?.reason==='last-success') {base=selection.sha;label='last-success'}
  else if (selection?.reason==='first-unverified-run') {
    // The earliest unsatisfied run also must be checked; start at its parent.
    try {
      const candidate=git('rev-parse',selection.sha+'^')
      if (ancestry(candidate,head)) {base=candidate;label='first-pending-parent'}
    } catch {
      // The full PR diff, already calculated above, safely covers rewritten histories.
    }
  }
  const files=execFileSync('git',['diff','--name-only','--diff-filter=ACDMRT','-z',base,head])
    .toString('utf8').split('\0').filter(Boolean)
  return {full:false,files,baseline:label+':'+base,routes:routeChanges(files)}
}

if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const event=JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'))
    const plan=await buildPlan(event,process.env.GITHUB_TOKEN)
    const lines=['full='+plan.full,'baseline='+plan.baseline]
    for (const [name,enabled] of Object.entries(plan.routes))
      lines.push(name.replaceAll('-','_')+'='+String(enabled))
    appendFileSync(process.env.GITHUB_OUTPUT, lines.join('\n')+'\n')
    console.log(JSON.stringify({
      full:plan.full,baseline:plan.baseline,
      changedFiles:plan.files,
      selected:Object.keys(plan.routes).filter(k=>plan.routes[k])
    },null,2))
  } catch(error) {
    console.error('[ci-impact] 路由失败：'+String(error))
    process.exitCode=1
  }
}
