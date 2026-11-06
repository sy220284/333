import { describe, expect, it } from 'bun:test'
import { parseCrossReviewSpec, parseReviewRequest } from '../src/commands/reviewMode.js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('用户按需选择第二模型交叉审查', () => {
  it('普通审查不创建第二模型任务', () => {
    expect(parseCrossReviewSpec('deep 19')).toBeNull()
    expect(parseReviewRequest('deep 19')).toEqual({ mode: 'deep', target: '19' })
  })
  it('接受显式 cross 模型和模式', () => {
    expect(parseCrossReviewSpec('cross opus security 19')).toEqual({ reviewer: 'opus', request: 'security 19' })
    expect(parseCrossReviewSpec('交叉 openai/gpt-5.5 deep 19')).toEqual({ reviewer: 'openai/gpt-5.5', request: 'deep 19' })
  })
  it('拒绝没有模型或含危险空格的模型参数', () => {
    expect(() => parseCrossReviewSpec('cross')).toThrow('需要指定模型')
    expect(() => parseCrossReviewSpec('cross /tmp deep')).toThrow('模型须为')
  })
  it('实际请求通过 Agent 模型参数进行显式复核', () => {
    const code = readFileSync(join(import.meta.dir, '../src/commands/review.ts'), 'utf8')
    expect(code).toContain('model=${JSON.stringify(cross.reviewer)}')
    expect(code).toContain('交叉复核未执行')
  })
})
