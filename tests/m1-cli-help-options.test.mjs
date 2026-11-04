import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseCliHelp } from '../build/m1-cli-help-options.mjs'

test('2.1.317 plugin root does not treat wrapped configure description as a top-level option', () => {
  const official = [
    'Usage: claude plugin|plugins [options] [command]',
    '',
    'Manage Claude Code plugins',
    '',
    'Options:',
    '  -h, --help                  Display help for command',
    '',
    'Commands:',
    '  configure [options] <plugin>  Show a plugin\'s options and which are',
    '                                 unset, or save values from stdin with',
    '                                 --values-stdin',
    '  install [options] <plugin>    Install a plugin',
  ].join('\n')
  assert.deepEqual(parseCliHelp(official), {
    usage: 'Usage: claude plugin|plugins [options] [command]',
    flags: ['--help'],
  })
})

test('2.1.317 real install flags and short aliases are parsed only in Options block', () => {
  const official = [
    'Usage: claude plugin install|i [options] <plugin>',
    'Options:',
    '  --accept-command <sha256>  Confirm one marketplace command',
    '  --config <key=value>       Configure the plugin',
    '  -h, --help                 Display help',
    '  --json                     Output JSON',
    '  --marketplace <source>     Use marketplace',
    '  --registry <url>           Registry',
    '  -s, --scope <scope>        Scope',
    '  -y, --yes                  Confirm',
  ].join('\r\n')
  assert.deepEqual(parseCliHelp(official).flags, [
    '--accept-command', '--config', '--help', '--json', '--marketplace',
    '--registry', '--scope', '--yes',
  ])
})
