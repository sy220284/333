/**
 * Score the 2.1.317 eval grader types against actual model traces and files.
 * Missing evidence is scored as a failure, never silently treated as pass.
 */
import { lstat, readFile, readdir, realpath } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import type { EvalGrader317 } from './pluginEvalCatalog317.ts'
import type { judgeEvalOutput317 } from './pluginEvalModel317.ts'

export type EvalGraderContext317 = {
  workspace: string
  lastMessage?: string
  baseline?: string
  trace?: unknown[]
  mockCalls?: unknown[]
}
export type EvalGraderVerdict317 = {
  name: string
  type: string
  weight: number
  pass: boolean
  score: number
  evidence?: string
  error?: string
}
type EvalToolUse317 = {name: string; input?: unknown}
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

function contains(root: string, candidate: string): boolean {
  const rel = relative(root, candidate)
  return rel === '' || (rel !== '..' && !rel.startsWith('../') && !rel.startsWith('..\\') && !isAbsolute(rel))
}

function globToRegex(glob: string): RegExp {
  const escaped = glob.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*')
  return new RegExp('^' + escaped + '$')
}

async function enumerateWorkspaceFiles(workspace: string, limit: number = 10000): Promise<string[]> {
  const base = await realpath(workspace)
  const todo: string[] = [base], found: string[] = []
  while (todo.length) {
    const current = todo.pop()
    if (current === undefined) break
    for (const item of await readdir(current, { withFileTypes: true })) {
      const path = join(current, item.name)
      if (item.isSymbolicLink()) continue
      if (item.isDirectory()) {
        if (!['node_modules', '.git'].includes(item.name)) todo.push(path)
      } else if (item.isFile()) {
        found.push(relative(base, path).replaceAll('\\', '/'))
        if (found.length > limit) throw new Error('eval workspace file count exceeded its limit')
      }
    }
  }
  return found
}

function traceToolUses(trace: unknown[] | undefined): EvalToolUse317[] {
  const uses: EvalToolUse317[] = []
  for (const event of trace ?? []) {
    if (!isRecord(event)) continue
    if (typeof event.name === 'string' && event.type === 'tool_use')
      uses.push({ name: event.name, input: event.input })
    const blocks = (isRecord(event.message) ? event.message.content : undefined) ?? event.content
    if (Array.isArray(blocks)) {
      for (const block of blocks) {
        if (isRecord(block) && block.type === 'tool_use' && typeof block.name === 'string')
          uses.push({ name: block.name, input: block.input })
      }
    }
  }
  return uses
}

function toolMatches(spec: unknown, tool: EvalToolUse317): boolean {
  const target: unknown = typeof spec === 'string' ? { tool: spec } : spec
  if (!isRecord(target) || typeof target.tool !== 'string' || tool.name !== target.tool) return false
  const pattern = target.input_match
  if (pattern === undefined || pattern === null || pattern === '') return true
  if (typeof pattern !== 'string') throw new Error('tool input matcher must be a regex string')
  return new RegExp(pattern).test(JSON.stringify(tool.input ?? {}))
}

async function selectedEvidence(target: unknown, context: EvalGraderContext317): Promise<string> {
  if (!target || target === 'last_message') return String(context.lastMessage ?? '')
  if (target === 'trace') return JSON.stringify(context.trace ?? [])
  if (target === 'mock_calls') return JSON.stringify(context.mockCalls ?? [])
  if (target === 'files') return JSON.stringify(await enumerateWorkspaceFiles(context.workspace))
  if (isRecord(target) && target.source === 'file') {
    if (typeof target.path !== 'string') throw new Error('eval file evidence path is required')
    const root = await realpath(context.workspace)
    const fullPath = resolve(root, target.path)
    if (!contains(root, fullPath)) throw new Error('grader file evidence escapes eval workspace')
    const actual = await realpath(fullPath)
    if (!contains(root, actual) || !(await lstat(actual)).isFile()) {
      throw new Error('grader file evidence is not an ordinary file inside eval workspace')
    }
    return readFile(actual, 'utf8')
  }
  throw new Error('unsupported grader evidence target')
}

export async function gradeEvalResult317(
  grader: EvalGrader317,
  context: EvalGraderContext317,
  judge?: typeof judgeEvalOutput317,
): Promise<EvalGraderVerdict317> {
  const details = { name: grader.name, type: grader.type, weight: grader.weight ?? 1 }
  try {
    let pass, evidence
    switch (grader.type) {
      case 'regex': {
        evidence = await selectedEvidence(grader.target, context)
        const patternValue = grader.pattern
        const flagsValue = grader.flags
        if (typeof patternValue !== 'string' ||
            (flagsValue !== undefined && typeof flagsValue !== 'string')) {
          throw new Error('Invalid regex grader pattern or flags')
        }
        const pattern = new RegExp(patternValue, (typeof flagsValue === 'string' ? flagsValue : '').replaceAll('g', '') + 'g')
        const count = [...evidence.matchAll(pattern)].length
        if (typeof grader.match === 'string' && grader.match.startsWith('count:')) {
          const wanted = Number(grader.match.slice(6))
          pass = count === wanted
        } else {
          pass = grader.match === 'not_contains' ? count === 0 : count > 0
        }
        return { ...details, pass, score: Number(pass), evidence: `matches=${count}` }
      }
      case 'file_exists': {
        const files = await enumerateWorkspaceFiles(context.workspace)
        if (typeof grader.path !== 'string') throw new Error('file grader path required')
        const pattern = globToRegex(grader.path)
        const exists = files.some(name => pattern.test(name))
        if (grader.exists !== undefined && typeof grader.exists !== 'boolean') throw new Error('file grader exists must be boolean')
        pass = exists === (grader.exists ?? true)
        return { ...details, pass, score: Number(pass), evidence: `exists=${exists}` }
      }
      case 'tool_used': {
        const tools = traceToolUses(context.trace)
        if (typeof grader.tool !== 'string') throw new Error('tool_used grader tool required')
        const count = tools.filter(tool => toolMatches({ tool: grader.tool, input_match: grader.input_match }, tool)).length
        const minimum = grader.min
        const maximum = grader.max
        if ((minimum !== undefined && typeof minimum !== 'number') ||
            (maximum !== undefined && typeof maximum !== 'number')) {
          throw new Error('tool count bounds must be numeric')
        }
        pass = count >= (typeof minimum === 'number' ? minimum : 1) &&
          (typeof maximum !== 'number' || count <= maximum)
        return { ...details, pass, score: Number(pass), evidence: `uses=${count}` }
      }
      case 'tool_order': {
        const tools = traceToolUses(context.trace)
        const first = tools.findIndex(tool => toolMatches(grader.before, tool))
        const last = tools.findIndex((tool, index) => index > first && toolMatches(grader.after, tool))
        pass = first !== -1 && last !== -1
        return { ...details, pass, score: Number(pass), evidence: `before=${first}, after=${last}` }
      }
      case 'llm':
      case 'baseline': {
        if (typeof judge !== 'function') {
          throw new Error('LLM grader requires a real judge model invocation')
        }
        const data = await selectedEvidence(grader.focus, context)
        const verdict = await judge({ grader, output: data, context })
        if (!verdict || typeof verdict.score !== 'number' ||
            verdict.score < 0 || verdict.score > 1 || !Number.isFinite(verdict.score)) {
          throw new Error('judge model returned no valid score in [0,1]')
        }
        return { ...details, pass: verdict.score >= 1, score: verdict.score,
          evidence: verdict.reason ?? '' }
      }
      default: throw new Error('Unsupported eval grader type: ' + grader.type)
    }
  } catch (error) {
    return { ...details, pass: false, score: 0,
      error: error instanceof Error ? error.message : String(error) }
  }
}

export function aggregateEvalScore317(
  verdicts: Array<{score: number; weight: number; pass: boolean; indicatorOnly?: boolean}>,
): {score: number | null; weight: number; passes: number; failures: number} {
  const scored = verdicts.filter(v => !v.indicatorOnly)
  const weight = scored.reduce((sum, v) => sum + v.weight, 0)
  if (weight === 0) return { score: null, weight: 0, passes: 0, failures: 0 }
  return {
    score: scored.reduce((sum, v) => sum + v.score * v.weight, 0) / weight,
    weight,
    passes: scored.filter(v => v.pass).length,
    failures: scored.filter(v => !v.pass).length,
  }
}
