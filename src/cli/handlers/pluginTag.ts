import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { validateManifest, validatePluginContents } from '../../utils/plugins/validatePlugin.js'
import { cliError, cliOk } from '../exit.js'

type TagOptions = {
  dryRun?: boolean
  force?: boolean
  message?: string
  push?: boolean
  remote?: string
}
type MarketplaceRef = {
  file: string
  index: number
  version?: string
  name?: string
}
function git(cwd: string, args: string[]) {
  const result = spawnSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8', timeout: 30000, windowsHide: true,
  })
  if (result.error) throw result.error
  return { status: result.status, stdout: result.stdout.trim(), stderr: result.stderr.trim() }
}
function fail(message: string): never {
  return cliError('✘ ' + message)
}
function pluginManifest(input: string): { root: string; file: string; data: Record<string, unknown> } {
  const selected = resolve(input)
  if (!existsSync(selected)) return fail('Path not found: ' + selected)
  const stat = statSync(selected)
  const attempts: Array<{ root: string; file: string }> = stat.isFile()
    ? [{ root: dirname(dirname(selected)), file: selected }]
    : [
        { root: selected, file: join(selected, '.claude-plugin', 'plugin.json') },
        { root: dirname(selected), file: join(selected, 'plugin.json') },
      ]
  for (const candidate of attempts) {
    if (!existsSync(candidate.file)) continue
    let value: unknown
    try {
      value = JSON.parse(readFileSync(candidate.file, 'utf8'))
    } catch (error) {
      return fail('Invalid JSON in ' + candidate.file + ': ' + String(error))
    }
    return { ...candidate, data: value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown> : {} }
  }
  return fail('No plugin manifest found. Expected ' +
    join(selected, '.claude-plugin', 'plugin.json') + '.')
}
function marketplaceRef(root: string, gitRoot: string, name: string): MarketplaceRef | undefined {
  let parent = root
  for (;;) {
    const file = join(parent, '.claude-plugin', 'marketplace.json')
    if (existsSync(file)) {
      const raw: unknown = JSON.parse(readFileSync(file, 'utf8'))
      if (raw && typeof raw === 'object' && 'plugins' in raw &&
        Array.isArray((raw as { plugins: unknown }).plugins)) {
        const manifest = raw as { name?: string; plugins: Array<Record<string, unknown>> }
        for (const [index, item] of manifest.plugins.entries()) {
          if (item?.name !== name || typeof item.source !== 'string') continue
          if (resolve(parent, item.source) === root) {
            return { file, index, name: manifest.name,
              version: typeof item.version === 'string' ? item.version : undefined }
          }
        }
      }
    }
    if (parent === gitRoot || dirname(parent) === parent) break
    parent = dirname(parent)
  }
}
function validVersion(value: string): boolean {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/.exec(value)
  if (!match) return false
  const elements = match.slice(1, 4)
  if (elements.some(x => x.length > 1 && x.startsWith('0'))) return false
  if (match[4] && match[4].split('.').some(x => !x || (/^\d+$/.test(x) && x.length > 1 && x.startsWith('0')))) return false
  return !match[5] || match[5].split('.').every(Boolean)
}
function output(lines: string[]): void {
  process.stdout.write(lines.join('\n') + '\n')
}
export async function pluginTagHandler(path: string | undefined, options: TagOptions): Promise<void> {
  const manifest = pluginManifest(path ?? '.')
  const name = manifest.data.name
  const warnings: string[] = []
  const validation = await validateManifest(manifest.file)
  const results = [validation]
  if (validation.success) results.push(...await validatePluginContents(manifest.root))
  for (const result of results) {
    for (const warning of result.warnings) {
      warnings.push('⚠ ' + relative(process.cwd(), result.filePath) + ': ' + warning.message)
    }
  }
  if (warnings.length) output(warnings)
  for (const result of results) {
    if (result.errors.length) {
      return fail('Plugin validation failed for ' + result.filePath + ':\n' +
        result.errors.map(x => '  ' + x.path + ': ' + x.message).join('\n'))
    }
  }
  if (typeof name !== 'string' || !name) return fail('plugin.json at ' + manifest.file + ' has no "name" field')
  const gitRootResult = git(manifest.root, ['rev-parse', '--show-toplevel'])
  const gitRoot = gitRootResult.stdout
  const market = gitRootResult.status === 0 ? marketplaceRef(manifest.root, gitRoot, name) : undefined
  const manifestVersion = typeof manifest.data.version === 'string' && manifest.data.version
    ? manifest.data.version : undefined
  const version = manifestVersion ?? market?.version
  const versionFrom = manifestVersion ? 'plugin.json' : 'marketplace entry'
  if (!version) return fail('No version to tag. Set "version" in ' + manifest.file +
    '. Tags are only used for dependency version constraints, which require an explicit semver — the git-SHA fallback does not need a tag.')
  if (market?.version && manifestVersion && market.version !== manifestVersion) {
    return fail('Version mismatch: plugin.json says "' + manifestVersion + '" but ' +
      relative(process.cwd(), market.file) + ' plugins[' + market.index + '].version says "' +
      market.version + '". plugin.json wins at install time, so update the marketplace entry to "' +
      manifestVersion + '" (or remove it) before tagging.')
  }
  if (!validVersion(version)) return fail('Version "' + version +
    '" is not valid semver. Dependency resolution (resolveVersionRange) ignores tags whose suffix doesn\'t parse as semver, so this tag would never be selected.')
  const tag = name + '--v' + version
  if (gitRootResult.status !== 0) return fail(manifest.root +
    ' is not inside a git repository. Dependency tags are resolved via git ls-remote, so the plugin must live in a git repo.')
  if (git(gitRoot, ['check-ref-format', 'refs/tags/' + tag]).status !== 0) {
    return fail('Computed tag name "' + tag + '" is not a valid git ref. Check the plugin name for characters git rejects (spaces, ~, ^, :, ?, *, [, \\, or sequences like .., @{, //).')
  }
  if (!options.force) {
    const selected = [relative(gitRoot, manifest.root) || '.']
    if (market) selected.push(relative(gitRoot, market.file))
    const changes = git(gitRoot, ['--no-optional-locks', 'status', '--porcelain', '--untracked-files=normal', '--', ...selected])
    if (changes.status !== 0) return fail('Cannot determine clean git state: ' + changes.stderr)
    if (changes.stdout) {
      const paths = changes.stdout.split(/\r?\n/).map(x => x.slice(3).trim()).filter(Boolean)
      return fail('Uncommitted changes affecting this release — commit them first so the tag points at the version you intend to release (or use --force):\n  ' +
        paths.slice(0, 5).join('\n  ') + (paths.length > 5 ? '\n  …and ' + (paths.length - 5) + ' more' : ''))
    }
    if (git(gitRoot, ['tag', '-l', '--', tag]).stdout === tag) {
      return fail('Tag "' + tag + '" already exists locally. Bump the version in ' +
        versionFrom + ', or re-run with --force to move the tag.')
    }
  }
  const remote = options.remote ?? 'origin'
  const message = options.message === undefined
    ? name + ' ' + version : options.message.replaceAll('%s', version)
  const pushCmd = 'git -C ' + gitRoot + ' push ' + (options.force ? '--force ' : '') +
    remote + ' refs/tags/' + tag
  const lines = ['Plugin:  ' + name, 'Version: ' + version + ' (from ' + versionFrom + ')']
  if (market) lines.push('Marketplace entry: plugins[' + market.index + '] in ' + market.file +
    (market.version ? ' (version: ' + market.version + ')' : ''))
  lines.push('Tag:     ' + tag, '')
  if (options.dryRun) {
    lines.push('✔ Dry run — would create tag ' + tag + ' at HEAD in ' + gitRoot,
      '  git -C ' + gitRoot + ' tag ' + (options.force ? '-f ' : '') + '-a ' + tag +
      ' -m ' + JSON.stringify(message), '  ' + pushCmd)
    return cliOk(lines.join('\n'))
  }
  const create = git(gitRoot, [
    '-c', 'tag.gpgSign=false', '-c', 'tag.forceSignAnnotated=false',
    'tag', ...(options.force ? ['-f'] : []), '-a', '-m', message, '--', tag, 'HEAD',
  ])
  if (create.status !== 0) return fail('git tag failed (exit ' + create.status + '): ' + (create.stderr || create.stdout))
  lines.push('✔ Created tag ' + tag)
  if (options.push) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(remote)) {
      return fail('Tag created locally but not pushed: "' + remote + '" is not a valid remote name.')
    }
    const pushed = git(gitRoot, ['push', ...(options.force ? ['--force'] : []),
      remote, 'refs/tags/' + tag])
    if (pushed.status !== 0) return fail('Tag created locally but push failed (exit ' + pushed.status + '): ' +
      (pushed.stderr || pushed.stdout))
    lines.push('✔ Pushed to ' + remote)
  } else {
    lines.push('  Push with: ' + pushCmd)
  }
  return cliOk(lines.join('\n'))
}
