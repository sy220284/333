/**
 * 2.1.317 eval case reader. Supports case.yaml plus prompt.md and
 * graders/*.md frontmatter, with strict schema and filesystem bounds.
 */
import { lstat, readFile, readdir, realpath } from 'node:fs/promises'
import { basename, join, relative, resolve, isAbsolute } from 'node:path'
import { parseYaml } from '../../utils/yaml.js'

export type EvalGrader317 = Record<string, unknown> & {
  name: string; type: string; weight: number;
  arm?: 'with-only' | 'both'; baseline_file?: string; criteria?: string; tool?: string
}
export type EvalCase317 = {
  name: string; schema_version: string; dir: string; runs: number;
  tags?: string[];
  context: { add_dirs: string[]; scaffold_script?: string; history_file?: string; [key: string]: unknown };
  execution: {
    prompt: string; max_turns: number; timeout_seconds: number;
    model?: string; allowed_tools?: string[]; disallowed_tools?: string[];
    append_system_prompt?: string; env?: NodeJS.ProcessEnv;
    [key: string]: unknown
  };
  graders: EvalGrader317[];
  [key: string]: unknown
}
const isMapping = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const MAX_CASES = 16
const MAX_CASE_FILE_BYTES = 1048576
const MAX_FILE_COUNT = 100000
const PERMITTED_TYPES = new Set(['regex','file_exists','tool_used','tool_order','llm','baseline'])
const TOP_FIELDS = new Set(['schema_version','name','description','tags','plugins','runs','expected_outcome'])
const EXEC_FIELDS = new Set(['model','max_turns','timeout_seconds','allowed_tools','disallowed_tools','artifact_publish','growthbook_overrides','append_system_prompt','env'])

function inside(root, target) {
  const rel = relative(root, target)
  return rel === '' || (rel !== '..' && !rel.startsWith('../') && !rel.startsWith('..\\') && !isAbsolute(rel))
}
async function readLimited(file) {
  const stat = await lstat(file)
  if (!stat.isFile()) throw new Error(`eval input must be a regular file: ${file}`)
  if (stat.size > MAX_CASE_FILE_BYTES) {
    throw new Error(`eval file is larger than ${MAX_CASE_FILE_BYTES} bytes: ${file}`)
  }
  return readFile(file, 'utf8')
}
function markdownFrontmatter(content, filename) {
  if (!content.startsWith('---\n') && !content.startsWith('---\r\n')) {
    return { metadata: {}, body: content, hasFrontmatter: false }
  }
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(content)
  if (!match) throw new Error(`unterminated YAML frontmatter: ${filename}`)
  const metadata = parseYaml(match[1]) ?? {}
  if (!isMapping(metadata)) {
    throw new Error(`frontmatter must be a YAML mapping: ${filename}`)
  }
  return { metadata, body: content.slice(match[0].length), hasFrontmatter: true }
}
function validateGrader(grader, dir) {
  if (!isMapping(grader) || typeof grader.name !== 'string' || !grader.name ||
    typeof grader.type !== 'string' || !PERMITTED_TYPES.has(grader.type)) {
    throw new Error(`invalid eval grader in ${dir}`)
  }
  if (grader.weight !== undefined &&
      (typeof grader.weight !== 'number' || grader.weight <= 0 || !Number.isFinite(grader.weight))) {
    throw new Error(`grader ${grader.name}: weight must be positive`)
  }
  if (grader.type === 'regex') {
    if (typeof grader.pattern !== 'string') throw new Error(`grader ${grader.name}: regex pattern required`)
    if (grader.flags !== undefined && typeof grader.flags !== 'string') throw new Error(`grader ${grader.name}: invalid regex flags`)
    if (!/^[dgimsuvy]*$/.test(grader.flags ?? '')) throw new Error(`grader ${grader.name}: invalid regex flags`)
    new RegExp(grader.pattern, grader.flags ?? '')
  }
  if (grader.type === 'file_exists' && typeof grader.path !== 'string') {
    throw new Error(`grader ${grader.name}: path required`)
  }
  if (grader.type === 'tool_used' && typeof grader.tool !== 'string') {
    throw new Error(`grader ${grader.name}: tool required`)
  }
  if (grader.type === 'tool_order' &&
    (grader.before === undefined || grader.after === undefined)) {
    throw new Error(`grader ${grader.name}: before and after tools required`)
  }
  if (['llm','baseline'].includes(grader.type) && typeof grader.criteria !== 'string') {
    throw new Error(`grader ${grader.name}: grading criteria required`)
  }
  if (grader.type === 'baseline' && typeof grader.baseline_file !== 'string') {
    throw new Error(`grader ${grader.name}: baseline_file required`)
  }
  if (grader.arm !== undefined && (typeof grader.arm !== 'string' || !['with-only', 'both'].includes(grader.arm))) {
    throw new Error(`grader ${grader.name}: arm must be with-only or both`)
  }
  return { weight: 1, ...grader, name: grader.name, type: grader.type } as EvalGrader317
}

async function readOptional(file) {
  try { return await readLimited(file) }
  catch (error) { if (error?.code === 'ENOENT') return null; throw error }
}
export async function readEvalCase317(dir) {
  const root = await realpath(dir)
  const rawYaml = await readOptional(join(root, 'case.yaml'))
  const base = rawYaml === null ? {} : parseYaml(rawYaml)
  if (!isMapping(base)) {
    throw new Error(`case.yaml must be a YAML object: ${dir}`)
  }
  const markdown = await readOptional(join(root, 'prompt.md'))
  const parsed = markdown === null
    ? { metadata: {}, body: '', hasFrontmatter: false }
    : markdownFrontmatter(markdown, join(root, 'prompt.md'))
  const top: Record<string, unknown> = {}
  const execution: Record<string, unknown> = isMapping(base.execution) ? { ...base.execution } : {}
  for (const [key, value] of Object.entries(parsed.metadata)) {
    if (TOP_FIELDS.has(key)) top[key] = value
    else if (EXEC_FIELDS.has(key)) execution[key] = value
    else throw new Error(`unknown prompt.md frontmatter field "${key}"`)
  }
  if (parsed.body.trim()) execution.prompt = parsed.body.trim()
  const markdownGraders = []
  const graderDir = join(root, 'graders')
  let entries = []
  try { entries = await readdir(graderDir, { withFileTypes: true }) }
  catch (error) { if (error?.code !== 'ENOENT') throw error }
  for (const item of entries) {
    if (!item.name.endsWith('.md')) continue
    if (!item.isFile()) throw new Error(`grader must be a regular file: ${item.name}`)
    const doc = markdownFrontmatter(await readLimited(join(graderDir, item.name)), item.name)
    if (!doc.hasFrontmatter) continue
    const grader: Record<string, unknown> = { name: item.name.slice(0,-3), ...doc.metadata }
    if (typeof grader.type === 'string' && ['regex','llm','baseline'].includes(grader.type)) {
      const field = grader.type === 'regex' ? 'pattern' : 'criteria'
      if (grader[field] === undefined) grader[field] = doc.body.trim()
    }
    markdownGraders.push(grader)
  }
  if (rawYaml === null && markdown === null && markdownGraders.length === 0) return null
  const data: Record<string, unknown> & {
    context: Record<string, unknown>;
    execution: Record<string, unknown>;
    graders: unknown[]
  } = {
    ...base, ...top,
    schema_version: top.schema_version ?? base.schema_version ?? '1.1',
    name: top.name ?? base.name ?? basename(root),
    context: { ...(isMapping(base.context) ? base.context : {}), add_dirs: isMapping(base.context) ? base.context.add_dirs ?? [] : [] },
    execution,
    graders: [...(Array.isArray(base.graders) ? base.graders : []), ...markdownGraders],
  }
  if (typeof data.schema_version !== 'string' ||
      !/^\d+\.\d+$/.test(data.schema_version) ||
      Number(data.schema_version.split('.')[0]) > 1) {
    throw new Error(`eval ${data.name}: unsupported schema_version`)
  }
  if (!data.context || typeof data.context !== 'object' || Array.isArray(data.context)) {
    throw new Error(`eval ${data.name}: context must be a mapping`)
  }
  for (const field of ['scaffold_script', 'history_file']) {
    const value = data.context[field]
    if (value !== undefined && (typeof value !== 'string' || !value.trim() ||
      isAbsolute(value))) {
      throw new Error(`eval ${data.name}: context.${field} must be a relative file inside the case or trusted plugin`)
    }
  }
  if (!Array.isArray(data.context.add_dirs) ||
      data.context.add_dirs.some(value => typeof value !== 'string' || !value.trim() ||
        isAbsolute(value))) {
    throw new Error(`eval ${data.name}: context.add_dirs must contain only relative paths`)
  }
  if (!data.execution || typeof data.execution.prompt !== 'string' || !data.execution.prompt.trim()) {
    throw new Error(`eval ${data.name}: execution.prompt is required`)
  }
  if (data.execution.prompt.includes('TODO: describe what the agent should do')) {
    throw new Error('The eval prompt is still the blank init template; replace its TODO description before running')
  }
  if (!Array.isArray(data.graders) || !data.graders.length) {
    throw new Error(`eval ${data.name}: at least one grader required`)
  }
  const names = new Set()
  data.graders = data.graders.map(g => {
    const grader = validateGrader(g, dir)
    if (typeof grader.criteria === 'string' &&
        grader.criteria.includes('TODO: describe what a successful response looks like')) {
      throw new Error('The eval grader is still the blank init template; replace its TODO success criteria')
    }
    if (names.has(grader.name)) throw new Error(`duplicate grader name "${grader.name}"`)
    names.add(grader.name)
    return grader
  })
  data.execution.max_turns ??= 10
  data.execution.timeout_seconds ??= 300
  data.runs ??= 3
  for (const [name, value, cap] of [
    ['execution.max_turns', data.execution.max_turns, 200],
    ['execution.timeout_seconds', data.execution.timeout_seconds, 3600],
    ['runs', data.runs, 50],
  ]) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > cap) {
      throw new Error(`eval ${data.name}: ${name} must be an integer in 1..${cap}`)
    }
  }
  if (typeof data.name !== 'string' || !data.name.trim()) {
    throw new Error('eval name must be a non-empty string')
  }
  if (data.tags !== undefined &&
      (!Array.isArray(data.tags) || !data.tags.every(tag => typeof tag === 'string'))) {
    throw new Error('eval tags must be strings')
  }
  for (const field of ['allowed_tools', 'disallowed_tools'] as const) {
    const value = data.execution[field]
    if (value !== undefined && (!Array.isArray(value) ||
      !value.every(tool => typeof tool === 'string'))) {
      throw new Error('eval execution.' + field + ' must list tool names')
    }
  }
  for (const field of ['model', 'append_system_prompt'] as const) {
    const value = data.execution[field]
    if (value !== undefined && typeof value !== 'string') {
      throw new Error('eval execution.' + field + ' must be a string')
    }
  }
  if (data.execution.env !== undefined &&
      (!isMapping(data.execution.env) ||
        Object.values(data.execution.env).some(value => typeof value !== 'string'))) {
    throw new Error('eval execution.env must contain string values')
  }
  return { ...data, dir: root } as EvalCase317
}

export async function discoverEvalCases317(
  evalRoot: string,
  options: {case?: string | string[]; tags?: string | string[]} = {},
): Promise<EvalCase317[]> {
  const root = await realpath(evalRoot)
  const todo = [root], cases: EvalCase317[] = []
  const casePatterns = options.case === undefined ? [] : Array.isArray(options.case) ? options.case : [options.case]
  const requestedTags = options.tags === undefined ? [] : Array.isArray(options.tags) ? options.tags : [options.tags]
  let inspected = 0
  while (todo.length) {
    const dir = todo.pop()
    if (++inspected > MAX_FILE_COUNT) throw new Error('eval directory scan exceeded its limit')
    const caseInfo = await readEvalCase317(dir)
    if (caseInfo) {
      if (casePatterns.length && !casePatterns.some(pattern => new RegExp('^' + pattern.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$').test(caseInfo.name))) continue
      if (requestedTags.length && !requestedTags.some(tag => caseInfo.tags?.includes(tag))) continue
      cases.push(caseInfo)
      if (cases.length > MAX_CASES) throw new Error(`eval suite exceeded ${MAX_CASES} cases`)
      continue
    }
    const children = await readdir(dir, { withFileTypes: true })
    for (const entry of children) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || ['results','mocks','node_modules'].includes(entry.name)) continue
      const path = join(dir, entry.name)
      const real = await realpath(path)
      if (!inside(root, real)) throw new Error(`eval directory leaves root: ${path}`)
      todo.push(path)
    }
  }
  return cases.sort((a, b) => a.dir.localeCompare(b.dir))
}
