/**
 * 2.1.317 eval case reader. Supports case.yaml plus prompt.md and
 * graders/*.md frontmatter, with strict schema and filesystem bounds.
 */
import { lstat, readFile, readdir, realpath } from 'node:fs/promises'
import { basename, join, relative, resolve, isAbsolute } from 'node:path'
import { parseYaml } from '../../utils/yaml.js'

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
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new Error(`frontmatter must be a YAML mapping: ${filename}`)
  }
  return { metadata, body: content.slice(match[0].length), hasFrontmatter: true }
}
function validateGrader(grader, dir) {
  if (!grader || typeof grader !== 'object' || Array.isArray(grader) ||
    typeof grader.name !== 'string' || !grader.name ||
    !PERMITTED_TYPES.has(grader.type)) {
    throw new Error(`invalid eval grader in ${dir}`)
  }
  if (grader.weight !== undefined &&
      (typeof grader.weight !== 'number' || grader.weight <= 0 || !Number.isFinite(grader.weight))) {
    throw new Error(`grader ${grader.name}: weight must be positive`)
  }
  if (grader.type === 'regex') {
    if (typeof grader.pattern !== 'string') throw new Error(`grader ${grader.name}: regex pattern required`)
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
  if (grader.arm !== undefined && !['with-only', 'both'].includes(grader.arm)) {
    throw new Error(`grader ${grader.name}: arm must be with-only or both`)
  }
  return { weight: 1, ...grader }
}

async function readOptional(file) {
  try { return await readLimited(file) }
  catch (error) { if (error?.code === 'ENOENT') return null; throw error }
}
export async function readEvalCase317(dir) {
  const root = await realpath(dir)
  const rawYaml = await readOptional(join(root, 'case.yaml'))
  const base = rawYaml === null ? {} : parseYaml(rawYaml)
  if (!base || typeof base !== 'object' || Array.isArray(base)) {
    throw new Error(`case.yaml must be a YAML object: ${dir}`)
  }
  const markdown = await readOptional(join(root, 'prompt.md'))
  const parsed = markdown === null
    ? { metadata: {}, body: '', hasFrontmatter: false }
    : markdownFrontmatter(markdown, join(root, 'prompt.md'))
  const top = {}, execution = { ...(base.execution ?? {}) }
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
    const grader = { name: item.name.slice(0,-3), ...doc.metadata }
    if (['regex','llm','baseline'].includes(grader.type)) {
      const field = grader.type === 'regex' ? 'pattern' : 'criteria'
      if (grader[field] === undefined) grader[field] = doc.body.trim()
    }
    markdownGraders.push(grader)
  }
  if (rawYaml === null && markdown === null && markdownGraders.length === 0) return null
  const data = {
    ...base, ...top,
    schema_version: top.schema_version ?? base.schema_version ?? '1.1',
    name: top.name ?? base.name ?? basename(root),
    context: { ...(base.context ?? {}), add_dirs: base.context?.add_dirs ?? [] },
    execution,
    graders: [...(base.graders ?? []), ...markdownGraders],
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
      isAbsolute(value) || value.split(/[\\/]/).includes('..'))) {
      throw new Error(`eval ${data.name}: context.${field} must be a relative file inside the case`)
    }
  }
  if (!Array.isArray(data.context.add_dirs) ||
      data.context.add_dirs.some(value => typeof value !== 'string' || !value.trim() ||
        isAbsolute(value) || value.split(/[\\/]/).includes('..'))) {
    throw new Error(`eval ${data.name}: context.add_dirs must contain only relative paths`)
  }
  if (!data.execution || typeof data.execution.prompt !== 'string' || !data.execution.prompt.trim()) {
    throw new Error(`eval ${data.name}: execution.prompt is required`)
  }
  if (!Array.isArray(data.graders) || !data.graders.length) {
    throw new Error(`eval ${data.name}: at least one grader required`)
  }
  const names = new Set()
  data.graders = data.graders.map(g => {
    const grader = validateGrader(g, dir)
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
    if (!Number.isInteger(value) || value < 1 || value > cap) {
      throw new Error(`eval ${data.name}: ${name} must be an integer in 1..${cap}`)
    }
  }
  return { ...data, dir: root }
}

export async function discoverEvalCases317(evalRoot, options = {}) {
  const root = await realpath(evalRoot)
  const todo = [root], cases = []
  let inspected = 0
  while (todo.length) {
    const dir = todo.pop()
    if (++inspected > MAX_FILE_COUNT) throw new Error('eval directory scan exceeded its limit')
    const caseInfo = await readEvalCase317(dir)
    if (caseInfo) {
      if (options.case && !new RegExp('^' + options.case.split('*').map(x => x.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')).join('.*') + '$').test(caseInfo.name)) continue
      if (options.tags?.length && !options.tags.some(tag => caseInfo.tags?.includes(tag))) continue
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
