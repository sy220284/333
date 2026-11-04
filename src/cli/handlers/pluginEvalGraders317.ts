/**
 * Score the 2.1.317 eval grader types against actual model traces and files.
 * Missing evidence is scored as a failure, never silently treated as pass.
 */
import { lstat, readFile, readdir, realpath } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'

function contains(root, candidate) {
  const rel = relative(root, candidate)
  return rel === '' || (rel !== '..' && !rel.startsWith('../') && !rel.startsWith('..\\') && !isAbsolute(rel))
}

function globToRegex(glob) {
  const escaped = glob.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*')
  return new RegExp('^' + escaped + '$')
}

async function enumerateWorkspaceFiles(workspace, limit = 10000) {
  const base = await realpath(workspace)
  const todo = [base], found = []
  while (todo.length) {
    const current = todo.pop()
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

function traceToolUses(trace) {
  const uses = []
  for (const event of trace ?? []) {
    if (event.name && event.type === 'tool_use') uses.push(event)
    const blocks = event?.message?.content ?? event?.content
    if (Array.isArray(blocks)) {
      for (const block of blocks) if (block?.type === 'tool_use') {
        uses.push({ name: block.name, input: block.input })
      }
    }
  }
  return uses
}

function toolMatches(spec, tool) {
  const target = typeof spec === 'string' ? { tool: spec } : spec
  if (tool.name !== target.tool) return false
  return !target.input_match || new RegExp(target.input_match).test(JSON.stringify(tool.input ?? {}))
}

async function selectedEvidence(target, context) {
  if (!target || target === 'last_message') return String(context.lastMessage ?? '')
  if (target === 'trace') return JSON.stringify(context.trace ?? [])
  if (target === 'mock_calls') return JSON.stringify(context.mockCalls ?? [])
  if (target === 'files') return JSON.stringify(await enumerateWorkspaceFiles(context.workspace))
  if (target?.source === 'file') {
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

export async function gradeEvalResult317(grader, context, judge) {
  const details = { name: grader.name, type: grader.type, weight: grader.weight ?? 1 }
  try {
    let pass, evidence
    switch (grader.type) {
      case 'regex': {
        evidence = await selectedEvidence(grader.target, context)
        const pattern = new RegExp(grader.pattern, (grader.flags ?? '').replaceAll('g', '') + 'g')
        const count = [...evidence.matchAll(pattern)].length
        if (grader.match?.startsWith('count:')) {
          const wanted = Number(grader.match.slice(6))
          pass = count === wanted
        } else {
          pass = grader.match === 'not_contains' ? count === 0 : count > 0
        }
        return { ...details, pass, score: Number(pass), evidence: `matches=${count}` }
      }
      case 'file_exists': {
        const files = await enumerateWorkspaceFiles(context.workspace)
        const pattern = globToRegex(grader.path)
        const exists = files.some(name => pattern.test(name))
        pass = exists === (grader.exists ?? true)
        return { ...details, pass, score: Number(pass), evidence: `exists=${exists}` }
      }
      case 'tool_used': {
        const tools = traceToolUses(context.trace)
        const count = tools.filter(tool => toolMatches({ tool: grader.tool, input_match: grader.input_match }, tool)).length
        pass = count >= (grader.min ?? 1) && (grader.max === undefined || count <= grader.max)
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

export function aggregateEvalScore317(verdicts) {
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
