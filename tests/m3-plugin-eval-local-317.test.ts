import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const source = readFileSync(join(import.meta.dir, '../src/cli/handlers/pluginEvalEntry317.ts'), 'utf8')
const insights = readFileSync(join(import.meta.dir, '../src/commands/insights.ts'), 'utf8')

describe('插件评估与会话分析仅在用户明确操作时处理数据', () => {
  it('插件评估始终保存本地报告，明确拒绝旧云端发布参数', () => {
    expect(source).toContain('savePluginEvalReport317')
    expect(source).toContain('options.publishReport === true || options.publish === true')
    expect(source).not.toContain('publishEvalReport317(')
    expect(source).not.toContain('tengu_quartz_thimble')
  })
  it('会话分析默认本地，模型分析必须显式启用', () => {
    expect(insights).toContain('if (options.modelAnalysis)')
    expect(insights).toContain('options.modelAnalysis\n    ? await generateParallelInsights')
    expect(insights).toContain("'--model-analysis'")
    expect(insights).not.toContain('s3://anthropic-serve')
    expect(insights).not.toContain('scp')
  })
})
