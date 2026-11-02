import { expect, test } from 'bun:test'
import { z } from 'zod/v4'
import { parseMcpToolArguments } from '../src/entrypoints/mcpInputValidation.js'

const commandSchema = z.strictObject({
  command: z.string().min(1),
  timeout: z.number().positive().optional(),
})

test('MCP validates allowed arguments before passing them to a tool', () => {
  expect(parseMcpToolArguments('Bash', commandSchema, {command: 'pwd'}))
    .toEqual({command: 'pwd'})
  expect(parseMcpToolArguments('Bash', commandSchema, {
    command: 'pwd',
    timeout: 2000,
  })).toEqual({command: 'pwd', timeout: 2000})
})

test('MCP rejects wrong types and missing required fields', () => {
  for (const args of [{}, {command: 123}, {command: ''}, {command: 'pwd', timeout: -1}]) {
    expect(() => parseMcpToolArguments('Bash', commandSchema, args))
      .toThrow(/Tool Bash input is invalid:/)
  }
})

test('MCP rejects unknown internal fields instead of accepting a pre-approved file edit', () => {
  expect(() => parseMcpToolArguments('Bash', commandSchema, {
    command: 'echo safe',
    _simulatedSedEdit: {
      filePath: '/tmp/unauthorized',
      oldContent: 'before',
      newContent: 'after',
    },
  })).toThrow(/_simulatedSedEdit/)
})

test('MCP handles an omitted argument object through the same schema', () => {
  const noArgs = z.strictObject({})
  expect(parseMcpToolArguments('NoArgs', noArgs, undefined)).toEqual({})
  expect(() => parseMcpToolArguments('Bash', commandSchema, undefined))
    .toThrow(/command/)
})
