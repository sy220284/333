import { describe, expect, test } from 'bun:test'
import {
  expectColorDiff,
  expectColorFile,
  getColorModuleUnavailableReason,
  getSyntaxTheme,
} from '../src/components/StructuredDiff/colorDiff.js'
import {
  ColorDiff,
  ColorFile,
} from '../src/native-ts/color-diff/index.js'

describe('2.1.310 结构化Diff的TypeScript实现链路', () => {
  test('默认走已移植的完整差异着色实现', () => {
    const old = process.env.CLAUDE_CODE_SYNTAX_HIGHLIGHT
    delete process.env.CLAUDE_CODE_SYNTAX_HIGHLIGHT
    try {
      expect(getColorModuleUnavailableReason()).toBeNull()
      expect(expectColorDiff()).toBe(ColorDiff)
      expect(expectColorFile()).toBe(ColorFile)
      expect(getSyntaxTheme('dark')?.theme).toBe('Monokai Extended')

      const hunk = {
        oldStart: 1, oldLines: 1,
        newStart: 1, newLines: 1,
        lines: ['-old value', '+new value'],
      }
      const lines = new ColorDiff(hunk, null, 'notes.txt').render('dark', 80, false)
      expect(lines).not.toBeNull()
      expect(lines?.length).toBeGreaterThan(0)
      expect(lines?.join('')).toContain('old value')
      expect(lines?.join('')).toContain('new value')

      const file = new ColorFile('one\ntwo\n', 'notes.txt').render('dark', 80, false)
      expect(file?.length).toBe(2)
      expect(file?.join('')).toContain('two')
    } finally {
      if (old === undefined) delete process.env.CLAUDE_CODE_SYNTAX_HIGHLIGHT
      else process.env.CLAUDE_CODE_SYNTAX_HIGHLIGHT = old
    }
  })

  test('显式关闭着色时遵守原有禁用规则', () => {
    const old = process.env.CLAUDE_CODE_SYNTAX_HIGHLIGHT
    process.env.CLAUDE_CODE_SYNTAX_HIGHLIGHT = 'false'
    try {
      expect(getColorModuleUnavailableReason()).toBe('env')
      expect(expectColorDiff()).toBeNull()
      expect(expectColorFile()).toBeNull()
      expect(getSyntaxTheme('dark')).toBeNull()
    } finally {
      if (old === undefined) delete process.env.CLAUDE_CODE_SYNTAX_HIGHLIGHT
      else process.env.CLAUDE_CODE_SYNTAX_HIGHLIGHT = old
    }
  })
})
