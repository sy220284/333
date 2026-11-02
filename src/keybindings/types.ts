/** 按 keybindings/schema.ts 和 parser.ts 的实际格式恢复类型。 */
import type { z } from 'zod/v4'
import {
  KEYBINDING_CONTEXTS,
  type KeybindingBlockSchema,
} from './schema.js'

export type KeybindingContextName = (typeof KEYBINDING_CONTEXTS)[number]
export type KeybindingBlock = z.infer<ReturnType<typeof KeybindingBlockSchema>>
/** Zod regex 校验过的 command 字符串在 TypeScript 中推断为 string。 */
export type KeybindingAction = KeybindingBlock['bindings'][string]

/** 解析器将 ctrl/alt/meta/super 五个标志存入独立布尔字段。 */
export type ParsedKeystroke = {
  key: string
  ctrl: boolean
  alt: boolean
  shift: boolean
  meta: boolean
  super: boolean
}

export type Chord = ParsedKeystroke[]

export type ParsedBinding = {
  chord: Chord
  action: KeybindingAction
  context: KeybindingContextName
}
