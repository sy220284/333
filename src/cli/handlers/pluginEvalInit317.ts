/**
 * Claude Code 2.1.317 "plugin eval init" interactive/bare authoring route.
 * The blank route is available in headless sessions; on a TTY the interviewer
 * gathers an actual prompt and grader before creating case files.
 */
import { mkdir, readFile, writeFile, stat, rm, realpath } from 'node:fs/promises'
import { createInterface } from 'node:readline/promises'
import { join, resolve, isAbsolute, relative } from 'node:path'

const VALID_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const yamlScalar = value => JSON.stringify(String(value))
async function present(path) {
  try { await stat(path); return true }
  catch (error) { if (error?.code === 'ENOENT') return false; throw error }
}
function safeWithin(root,path) {
  const r=relative(root,path)
  return r === '' || (r !== '..' && !r.startsWith('../') && !r.startsWith('..\\') && !isAbsolute(r))
}

export async function createEvalCase317(name, options = {}) {
  const cwd = resolve(options.cwd ?? process.cwd())
  const override = options.evalDir
  const isPlugin = await present(join(cwd,'.claude-plugin','plugin.json')) ||
    await present(join(cwd,'SKILL.md')) || await present(join(cwd,'.claude-plugin','marketplace.json'))
  if (!isPlugin && !override) {
    throw new Error('plugin eval init must be run inside a plugin or skill folder (or pass --eval-dir)')
  }
  const rawDir = override ?? 'evals'
  if (typeof rawDir !== 'string' || isAbsolute(rawDir) ||
      rawDir.split(/[\\/]/).some(s => s === '..')) {
    throw new Error('eval directory must stay inside the current plugin')
  }
  const base=await realpath(cwd)
  const suite=resolve(base,rawDir)
  if (!safeWithin(base,suite)) throw new Error('eval directory escaped plugin root')
  if (await present(suite) && !safeWithin(base,await realpath(suite))) {
    throw new Error('eval directory symlink escaped plugin root')
  }
  if (typeof name !== 'string' || !VALID_NAME.test(name) || name === '.' ||
      name === '..' || name.startsWith('.')) {
    throw new Error('eval case name may contain only letters, digits, dots, underscores and dashes')
  }
  const folder=join(suite,name)
  if (await present(folder)) throw new Error('eval case already exists: '+folder)
  const prompt=options.prompt ?? '# Describe the test task here\n'
  const criteria=options.criteria ?? 'The final answer fulfills the requested task accurately.'
  const rawCase=[
    'schema_version: "1.1"',
    'name: '+yamlScalar(name),
    'description: '+yamlScalar(options.description ?? ''),
    'tags: []',
    'context:',
    '  add_dirs: []',
    'execution:',
    '  max_turns: 10',
    '  timeout_seconds: 300',
    'runs: 3',
    '',
  ].join('\n')
  let made=false
  try {
    await mkdir(folder,{recursive:false})
    made=true
    await mkdir(join(folder,'graders'))
    await writeFile(join(folder,'case.yaml'),rawCase,{flag:'wx'})
    await writeFile(join(folder,'prompt.md'),prompt.endsWith('\n')?prompt:prompt+'\n',{flag:'wx'})
    await writeFile(join(folder,'graders','outcome.md'),
      '---\ntype: llm\nweight: 1\n---\n'+criteria+'\n',{flag:'wx'})
  } catch (error) {
    if (made) await rm(folder,{recursive:true,force:true})
    throw error
  }
  return folder
}

export async function pluginEvalInit317(name, options = {}) {
  const interactive = !options.bare && (options.interactive ||
    (process.stdin.isTTY && process.stdout.isTTY))
  if (interactive && !(process.stdin.isTTY && process.stdout.isTTY)) {
    throw new Error('The eval authoring interview requires a terminal (TTY)')
  }
  if (!interactive && !name) {
    throw new Error('A case name is required when no interactive terminal is available')
  }
  let prompt,criteria,description
  if (interactive) {
    const io=createInterface({input:process.stdin,output:process.stdout})
    try {
      name ||= (await io.question('Case name: ')).trim()
      description=(await io.question('Purpose of this test: ')).trim()
      prompt=(await io.question('Prompt for the model: ')).trim()
      criteria=(await io.question('What outcome proves success? ')).trim()
    } finally { io.close() }
    if (!prompt || !criteria) throw new Error('A prompt and outcome criteria are required')
  }
  const folder=await createEvalCase317(name,{...options,prompt,criteria,description})
  process.stdout.write('Created Claude Code 2.1.317 plugin eval case: '+folder+'\n')
  return 0
}
