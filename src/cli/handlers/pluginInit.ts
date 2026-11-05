import { spawnSync } from 'node:child_process'
import { lstat, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'

type InitOptions = {
  author?: string
  authorEmail?: string
  description?: string
  force?: boolean
  with?: string[]
}
const allowed = ['skills', 'agents', 'hooks', 'mcp', 'lsp', 'output-style', 'channel'] as const
const variableRoot = '$' + '{CLAUDE_PLUGIN_ROOT}'
const json = (v: unknown) => JSON.stringify(v, null, 2) + '\n'

function gitValue(key: string): string | undefined {
  const result = spawnSync('git', ['config', '--get', key], { encoding: 'utf8', timeout: 5000, windowsHide: true })
  return result.status === 0 ? result.stdout.trim() || undefined : undefined
}
function skill(name: string): string {
  return [
    '---', 'name: ' + name,
    'description: TODO — describe WHEN Claude should use this. Include trigger phrases users',
    '  might say ("do X", "set up Y", "review Z"). Be specific; this string is what Claude',
    "  matches the user's request against.",
    '---', '', '# ' + name, '',
    'TODO: what this skill does, and the steps Claude should take.', '',
  ].join('\n')
}
function channelServer(name: string): string {
  return [
    '#!/usr/bin/env bun',
    '/**',
    ' * ' + name + ' channel server — stdio MCP server implementing the channel contract.',
    ' * See https://code.claude.com/docs/en/channels-reference.',
    ' */',
    "import { Server } from '@modelcontextprotocol/server'",
    "import { StdioServerTransport } from '@modelcontextprotocol/server/stdio'",
    '',
    'const mcp = new Server(',
    "  { name: '" + name + "', version: '0.1.0' },",
    '  {',
    '    capabilities: {',
    '      tools: {},',
    '      // Required: presence of this key registers the channel notification',
    "      // listener on Claude's side.",
    "      experimental: { 'claude/channel': {} },",
    '    },',
    '    instructions:',
    '      "Events from ' + name + ' arrive as <channel source=\\"' + name + '\\" ...>. Anything " +',
    '      "you want the sender to see must go through the reply tool — your " +',
    '      "transcript output never reaches the channel.",',
    '  },',
    ')',
    '',
    "mcp.setRequestHandler('tools/list', async () => ({",
    '  tools: [',
    '    {',
    "      name: 'reply',",
    "      description: 'Send a message back to the " + name + " channel.',",
    '      inputSchema: {',
    "        type: 'object',",
    "        properties: { text: { type: 'string' } },",
    "        required: ['text'],",
    '      },',
    '    },',
    '  ],',
    '}))',
    '',
    "mcp.setRequestHandler('tools/call', async req => {",
    '  const args = (req.params.arguments ?? {}) as Record<string, unknown>',
    "  if (req.params.name === 'reply') {",
    '    // TODO: deliver args.text to the external service.',
    "    return { content: [{ type: 'text', text: 'sent' }] }",
    '  }',
    "  return { content: [{ type: 'text', text: 'unknown tool' }], isError: true }",
    '})',
    '',
    '// TODO: when the external service has an inbound event, push it to Claude:',
    '//',
    '//   await mcp.notification({',
    "  //     method: 'notifications/claude/channel',",
    '//     params: {',
    "  //       content: 'the event body',",
    "  //       meta: { chat_id: '...', sender: '...' },",
    '//     },',
    '//   })',
    '//',
    '// Each meta key becomes an attribute on the <channel> tag. Keys must be',
    '// identifiers (letters/digits/underscores) — others are silently dropped.',
    '',
    'await mcp.connect(new StdioServerTransport())',
    '',
  ].map(line => line.startsWith('  // ') ? line.slice(2) : line).join('\n')
}
function filesFor(name: string, options: InitOptions, author: string | undefined, email: string | undefined): Map<string, string> {
  const extra = new Set(options.with ?? [])
  const manifest: Record<string, unknown> = {
    $schema: 'https://anthropic.com/claude-code/plugin.schema.json',
    name, version: '0.1.0',
    description: options.description ?? 'TODO: describe what this plugin provides',
  }
  if (author || email) manifest.author = { ...(author && { name: author }), ...(email && { email }) }
  manifest.skills = ['./']
  if (extra.has('channel')) manifest.channels = [{ server: name, displayName: name }]
  const result = new Map<string, string>([
    ['.claude-plugin/plugin.json', json(manifest)],
    ['SKILL.md', skill(name)],
  ])
  if (extra.has('skills')) result.set('skills/example/SKILL.md', skill('example'))
  if (extra.has('agents')) result.set('agents/example.md', [
    '---', 'name: example',
    'description: TODO — when should Claude delegate to this subagent?',
    'tools:', '  - Read', '  - Grep', '---', '',
    'TODO: system prompt for the subagent.', '',
  ].join('\n'))
  if (extra.has('hooks')) {
    result.set('hooks/hooks.json', json({ hooks: { SessionStart: [{ hooks: [{
      type: 'command', command: 'bun "' + variableRoot + '/hooks-handlers/on-session-start.ts"',
    }] }] } }))
    result.set('hooks-handlers/on-session-start.ts', [
      '#!/usr/bin/env bun',
      '// SessionStart hook handler. Reads the event from stdin, writes a JSON result',
      '// to stdout. Swap "bun" for "node" or "python3" in hooks/hooks.json if your',
      "// users' environment lacks bun.",
      'const input = await new Response(Bun.stdin.stream()).text()',
      'const event = JSON.parse(input)',
      'process.stdout.write(JSON.stringify({}))',
      '',
    ].join('\n'))
  }
  if (extra.has('channel')) {
    result.set('.mcp.json', json({ mcpServers: { [name]: {
      command: 'bun',
      args: ['run', '--cwd', variableRoot, '--shell=bun', '--silent', 'start'],
    } } }))
    result.set('package.json', json({
      name: 'claude-channel-' + name, version: '0.1.0', type: 'module',
      scripts: { start: 'bun install --no-summary && bun server.ts' },
      dependencies: { '@modelcontextprotocol/server': '^2.4.0' },
    }))
    result.set('server.ts', channelServer(name))
  } else if (extra.has('mcp')) {
    result.set('.mcp.json', json({ mcpServers: {
      'example-remote': { type: 'http', url: 'https://example.com/mcp' },
      'example-local': { command: 'npx', args: ['<your-mcp-server-package>'] },
    } }))
  }
  if (extra.has('lsp')) result.set('.lsp.json', json({ example: {
    command: 'example-language-server', args: ['--stdio'],
    extensionToLanguage: { '.example': 'example' },
  } }))
  if (extra.has('output-style')) result.set('output-styles/' + name + '.md', [
    '---', 'name: ' + name,
    'description: TODO — one line shown in the Output style picker in /config',
    'force-for-plugin: true', 'keep-coding-instructions: true', '---', '',
    "TODO: the style prompt. This is appended to Claude's system prompt while the",
    'style is active. With force-for-plugin: true, the style applies automatically',
    'when this plugin is enabled.', '',
  ].join('\n'))
  return result
}
function bad(message: string): never {
  console.log('✘ ' + message)
  process.exit(1)
}
export async function pluginInitHandler(name: string, options: InitOptions): Promise<void> {
  if (!name || name === '.' || name.includes('..') || /[\\/]/.test(name)) {
    bad('Invalid plugin name "' + name + '": Plugin name cannot contain path separators (/ or \\), ".." sequences, or be "."')
  }
  if (/\s/.test(name)) bad('Invalid plugin name "' + name + '": Plugin name cannot contain spaces. Use kebab-case (e.g., "my-plugin")')
  const extras = [...new Set(options.with ?? [])]
  for (const component of extras) {
    if (!(allowed as readonly string[]).includes(component)) {
      bad('Unknown --with component "' + component + '". Valid: ' + allowed.join(', '))
    }
  }
  const directory = join(getClaudeConfigHomeDir(), 'skills', name)
  const marker = join(directory, '.claude-plugin')
  const author = options.author || gitValue('user.name')
  const email = options.authorEmail || gitValue('user.email')
  try {
    const info = await lstat(marker).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return undefined
      throw error
    })
    if (info && !options.force) bad(marker + ' already exists. Use --force to overwrite.')
    if (info && !info.isDirectory()) bad(marker + ' exists but is not a directory.')
    for (const [relative, content] of filesFor(name, options, author, email)) {
      const target = join(directory, relative)
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, content, 'utf8')
    }
  } catch (error) {
    bad('Could not create plugin "' + name + '": ' + (error instanceof Error ? error.message : String(error)))
  }
  const warnings: string[] = []
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(name)) warnings.push(
    'name: Plugin name "' + name + '" is not kebab-case. Claude Code accepts it, but the Claude.ai marketplace sync requires kebab-case (lowercase letters, digits, and hyphens only, e.g., "my-plugin").',
  )
  if (!author && !email) warnings.push('author: No author information provided. Consider adding author details for plugin attribution')
  if (warnings.length > 0) {
    console.log('⚠ Found ' + warnings.length + ' warning' + (warnings.length === 1 ? '' : 's') + ':\n')
    for (const warning of warnings) console.log('  ❯ ' + warning)
    console.log('')
  }
  console.log('✔ Created plugin "' + name + '" at ' + directory + '\n' +
    '  It will auto-load next session as ' + name + '@skills-dir. Run /reload-plugins to load it now.\n' +
    '  Disable: claude plugin disable ' + name + '@skills-dir. Remove: delete the directory.')
}
