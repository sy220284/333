import { expect, test } from 'bun:test'
import {
  KEYBINDING_ACTIONS,
  KEYBINDING_CONTEXTS,
  KeybindingBlockSchema,
} from '../src/keybindings/schema.js'

const scrollActions = [
  'scroll:pageUp',
  'scroll:pageDown',
  'scroll:lineUp',
  'scroll:lineDown',
  'scroll:top',
  'scroll:bottom',
  'scroll:halfPageUp',
  'scroll:halfPageDown',
  'scroll:fullPageUp',
  'scroll:fullPageDown',
  'selection:copy',
]
const messageActions = [
  'messageActions:prev',
  'messageActions:next',
  'messageActions:top',
  'messageActions:bottom',
  'messageActions:prevUser',
  'messageActions:nextUser',
  'messageActions:escape',
  'messageActions:ctrlc',
  'messageActions:enter',
  'messageActions:c',
  'messageActions:p',
]

for (const [context, actions] of [
  ['Scroll', scrollActions],
  ['MessageActions', messageActions],
] as const) {
  test(`runtime bindings of ${context} are accepted by user config schema`, () => {
    expect(KEYBINDING_CONTEXTS).toContain(context)
    for (const action of actions) {
      expect(KEYBINDING_ACTIONS).toContain(action)
      const config = {
        context,
        bindings: { 'ctrl+shift+a': action },
      }
      const parsed = KeybindingBlockSchema().safeParse(config)
      expect(parsed.success).toBe(true)
      if (!parsed.success) throw parsed.error
      expect(parsed.data).toEqual(config)
    }
  })
}

test('configuration still rejects unregistered keyboard actions', () => {
  expect(
    KeybindingBlockSchema().safeParse({
      context: 'Scroll',
      bindings: { a: 'scroll:arbitraryUnsafeAction' },
    }).success,
  ).toBe(false)
})
