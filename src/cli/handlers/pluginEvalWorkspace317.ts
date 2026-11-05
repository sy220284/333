/**
 * Claude Code 2.1.317 plugin-eval per-case filesystem contract.
 * Author-controlled scripts require explicit --scaffold. All contextual
 * files are resolved through realpath inside the case or trusted plugin.
 */
import { spawn } from 'node:child_process'
import { lstat, realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'

const inside = (root, path) => {
  const rel = relative(root, path)
  return rel === '' || (rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel))
}
function allowedFileParts(path) {
  const names = path.split(/[\\/]/)
  return !names.includes('.git') && !names.includes('.hg') &&
    !names.includes('.svn')
}
export async function resolveEvalContext317(caseInfo, sourcePluginRoot, runPluginRoot) {
  const context = caseInfo.context ?? {}
  const caseDir = await realpath(caseInfo.dir)
  const pluginDir = sourcePluginRoot ? await realpath(sourcePluginRoot) : caseDir
  async function source(name, type) {
    if (typeof name !== 'string' || !name.trim() || isAbsolute(name) || !allowedFileParts(name)) {
      throw new Error('eval context.' + type + ' requires a relative non-VCS path')
    }
    const file = await realpath(resolve(caseDir, name))
    if (!inside(caseDir, file) && !inside(pluginDir, file)) {
      throw new Error('eval context.' + type + ' escaped the case and trusted plugin')
    }
    const stat = await lstat(file)
    if (type === 'add_dirs' ? !stat.isDirectory() : !stat.isFile()) {
      throw new Error('eval context.' + type + ' has the wrong file type')
    }
    return file
  }
  const addDirs = []
  for (const entry of context.add_dirs ?? []) {
    addDirs.push(await source(entry, 'add_dirs'))
  }
  const scaffoldScript = context.scaffold_script
    ? await source(context.scaffold_script, 'scaffold_script') : undefined
  const historyFile = context.history_file
    ? await source(context.history_file, 'history_file') : undefined
  return { addDirs, scaffoldScript, historyFile }
}

export async function runEvalScaffold317(script: string, workspace: string, timeoutSeconds: number = 300, env: {} = {}) : Promise<{ code: number; stderr: string; signal: NodeJS.Signals | null; }> {
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 3600) {
    throw new Error('Invalid eval scaffold timeout')
  }
  const child = spawn(process.platform === 'win32' ? 'bash.exe' : 'bash', [script], {
    cwd: workspace,
    env: { ...process.env, ...env },
    windowsHide: true,
    timeout: timeoutSeconds * 1000,
    stdio: ['ignore','pipe','pipe'],
  })
  let output = ''
  const limit = 65536
  function collect(chunk) {
    if (output.length < limit) output += chunk.toString('utf8').slice(0,limit-output.length)
  }
  child.stdout.on('data', collect)
  child.stderr.on('data', collect)
  return await new Promise<{ code: number; stderr: string; signal: NodeJS.Signals | null }>((ok, fail) => {
    child.once('error', fail)
    child.once('close', (code, signal) => ok({
      code: code ?? 1,
      stderr: output,
      signal,
    }))
  })
}
