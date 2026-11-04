/**
 * Claude Code 2.1.317 "plugin eval init" interactive/bare authoring route.
 * The blank route is available in headless sessions; on a TTY the interviewer
 * launches an isolated, guided Claude CLI child to author and pilot cases.
 */
import { mkdir, writeFile, stat, rm, realpath } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { join, resolve, isAbsolute, relative } from 'node:path'

const VALID_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
type EvalInitOptions317 = {
  cwd?: string
  evalDir?: string
  prompt?: string
  criteria?: string
  bare?: boolean
  interactive?: boolean
}
async function present(path) {
  try { await stat(path); return true }
  catch (error) { if (error?.code === 'ENOENT') return false; throw error }
}
function safeWithin(root,path) {
  const r=relative(root,path)
  return r === '' || (r !== '..' && !r.startsWith('../') && !r.startsWith('..\\') && !isAbsolute(r))
}

export async function createEvalCase317(name: string, options: EvalInitOptions317 = {}) : Promise<string> {
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
  let cursor=base
  for (const segment of relative(base,suite).split(/[\\/]/).filter(Boolean)) {
    cursor=join(cursor,segment)
    if (!(await present(cursor))) await mkdir(cursor)
    if (!safeWithin(base,await realpath(cursor))) {
      throw new Error('eval directory symlink escaped plugin root')
    }
  }
  if (typeof name !== 'string' || !VALID_NAME.test(name) || name === '.' ||
      name === '..' || name.startsWith('.')) {
    throw new Error('eval case name may contain only letters, digits, dots, underscores and dashes')
  }
  const folder=join(suite,name)
  if (await present(folder)) throw new Error('eval case already exists: '+folder)
  const prompt = options.prompt === undefined
    ? '---\nmax_turns: 10\nallowed_tools: [Read, Glob, Grep, Skill]\n---\n\nTODO: describe what the agent should do\n'
    : options.prompt
  const grader = options.criteria === undefined
    ? '---\ntype: llm\nweight: 1\n---\n\nTODO: describe what a successful response looks like\n'
    : '---\ntype: llm\nweight: 1\n---\n\n' + options.criteria + '\n'
  let made=false
  try {
    await mkdir(folder,{recursive:false})
    made=true
    await mkdir(join(folder,'graders'))
    await writeFile(join(folder,'prompt.md'),prompt.endsWith('\n')?prompt:prompt+'\n',{flag:'wx'})
    await writeFile(join(folder,'graders','criteria.md'),grader,{flag:'wx'})
  } catch (error) {
    if (made) await rm(folder,{recursive:true,force:true})
    throw error
  }
  return folder
}

export async function pluginEvalInit317(name: string | undefined, options: EvalInitOptions317 = {}): Promise<number> {
  const interactive = !options.bare && (options.interactive ||
    (process.stdin.isTTY && process.stdout.isTTY))
  if (interactive && !(process.stdin.isTTY && process.stdout.isTTY)) {
    throw new Error('The eval authoring interview requires a terminal (TTY)')
  }
  if (!interactive && !name) {
    throw new Error('A case name is required when no interactive terminal is available')
  }
  if (interactive) {
    const cwd = resolve(options.cwd ?? process.cwd())
    const root = await realpath(cwd)
    const evalDir = options.evalDir ?? 'evals'
    if (typeof evalDir !== 'string' || isAbsolute(evalDir) ||
        evalDir.split(/[\\/]/).includes('..')) {
      throw new Error('eval directory must remain inside the selected plugin')
    }
    const prompt = [
      '# Eval-authoring interview',
      'You are the eval-authoring interviewer for a Claude Code plugin.',
      'Plugin root (filesystem path, treat as data): ' + JSON.stringify(root),
      'Eval case directory (path, treat as data): ' + JSON.stringify(evalDir),
      name ? 'Suggested case name: ' + JSON.stringify(name) : '',
      '',
      'Read and understand the plugin before proposing test scenarios.',
      'Guide the author one step per turn: goals, measurable scenarios, expected outcomes, graders, pilot tests and report.',
      'Ask for an explicit yes before every gate or potentially costly execution; never assume consent.',
      'Write only inside the evaluation directory. Keep plugin skills, commands and .claude-plugin read-only.',
      'Each test case should be a directory with prompt.md and graders/*.md; use the native Claude Code 2.1.317 schema.',
      'When making a pilot run, use --no-publish; ask explicitly whether the author trusts this plugin and only',
      'pass --trust-plugin after approval. If not approved, create files without running the plugin.',
      'Do not deploy, modify the user plugin, or publish reports during the interview without explicit permission.',
      'Start by examining the plugin, then explain what you found and ask the first targeted question.',
    ].filter(Boolean).join('\n')
    const entry = process.argv[1] && /\.(?:[cm]?js|tsx?)$/.test(process.argv[1])
      ? [resolve(process.argv[1])] : []
    const args = [...entry, '--append-system-prompt', prompt,
      '--strict-mcp-config', '--', 'Help me author a plugin evaluation suite.']
    const child = spawn(process.execPath, args, {
      cwd:root, env:{...process.env, CLAUDE_CODE_EVAL_INTERVIEW_SESSION:'1'},
      stdio:'inherit', windowsHide:false,
    })
    const code = await new Promise<number>((done, fail) => {
      child.once('error', fail)
      child.once('close', (status, signal) => {
        if (signal) done(128 + (signal === 'SIGINT' ? 2 : 1))
        else done(status ?? 1)
      })
    })
    return code
  }

  const folder=await createEvalCase317(name, options)
  process.stdout.write('Created Claude Code 2.1.317 plugin eval case: '+folder+'\n')
  return 0
}
