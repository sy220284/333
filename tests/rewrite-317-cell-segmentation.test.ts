import { describe, expect, test } from 'bun:test'
import { segmentTerminalCells } from '../src/ink/terminalCellSegmentation.js'
import { StylePool } from '../src/ink/screen.js'

describe('317 私有字符单元接口按333 TypeScript终端底层适配', () => {
  test('ASCII 和 ANSI 颜色转换为相同显示宽度的可绘制单元', () => {
    const styles = new StylePool()
    const plain = segmentTerminalCells('abc', styles)
    const colored = segmentTerminalCells('\x1b[31mabc\x1b[0m', styles)
    expect(plain.map(c => [c.value,c.width])).toEqual(colored.map(c => [c.value,c.width]))
    expect(plain.map(c => c.width)).toEqual([1,1,1])
    expect(colored[0]!.styleId).not.toBe(plain[0]!.styleId)
  })

  test('中文、组合音标和家族 emoji 保持 grapheme 原子性和终端占位', () => {
    const cells=segmentTerminalCells('你e\u0301👨‍👩‍👧‍👦', new StylePool())
    expect(cells.map(c=>c.value)).toEqual(['你','e\u0301','👨‍👩‍👧‍👦'])
    expect(cells.map(c=>c.width)).toEqual([2,1,2])
  })

  test('OSC 8 链接进入 cell 的独立超链接字段，关闭后不污染后续单元', () => {
    const cells=segmentTerminalCells('\x1b]8;;https://example.org\x07链\x1b]8;;\x07后',new StylePool())
    expect(cells.map(c=>c.value)).toEqual(['链','后'])
    expect(cells[0]!.hyperlink).toBe('https://example.org')
    expect(cells[1]!.hyperlink).toBeUndefined()
  })

  test('空行无单元、连续字符样式切换保留宽度与样式边界', () => {
    const pool=new StylePool()
    expect(segmentTerminalCells('',pool)).toEqual([])
    const cells=segmentTerminalCells('a\x1b[1mb\x1b[22mc',pool)
    expect(cells.map(c=>c.value)).toEqual(['a','b','c'])
    expect(cells.map(c=>c.width)).toEqual([1,1,1])
    expect(cells[0]!.styleId).not.toBe(cells[1]!.styleId)
  })
})
