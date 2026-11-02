#!/usr/bin/env node
/**
 * Reproducible source-level comparison of pre-PR7 research against PR7.
 * A changed source is an investigation lead, never an implementation signoff.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const BASELINE = '872cb978ac5a605f61d90fc78b537307983db255'
const BEFORE_REVIEW = '65c0b961efffc267b519551bcdf448e49c06a6da'
const out = process.argv[2]
if (!out) throw new Error('用法：node build/m1-research-cross-audit.mjs <输出JSON路径>')
const command = (args) => execFileSync('git', args, {
  cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
})
function sourceTree(ref) {
  const result = new Map()
  const raw = command(['ls-tree', '-r', '-z', ref, '--', 'src'])
  for (const line of raw.split('\0')) {
    if (!line) continue
    const sep = line.indexOf('\t')
    const match = /^100644 blob ([0-9a-f]{40})$/.exec(line.slice(0, sep))
    if (!match) throw new Error('无法完整读取源码Git Tree')
    result.set(line.slice(sep + 1), match[1])
  }
  return result
}
const old = sourceTree(BASELINE)
const prior = sourceTree(BEFORE_REVIEW)
const current = sourceTree('HEAD')
const currentHead = command(['rev-parse', 'HEAD']).trim()
const flags = JSON.parse(readFileSync(resolve(ROOT, 'research/claude-code-2.1.88/features/feature-index.json'), 'utf8'))
if (!Array.isArray(flags) || flags.length !== 90) throw new Error('旧版功能研究清单必须恰好90项')
const build = readFileSync(resolve(ROOT, 'build/rebuild.mjs'), 'utf8')
const buildFeatures = build.match(/features:\s*\[([^\]]+)\]/)
if (!buildFeatures) throw new Error('无法识别正式编译开关')
const enabled = new Set([...buildFeatures[1].matchAll(/'([A-Z_]+)'/g)].map(m => m[1]))
const beforeEnabled = new Set(['TRANSCRIPT_CLASSIFIER', 'KAIROS_BRIEF', 'BUILDING_CLAUDE_APPS'])
const target = {
  AUTO_THEME: ['按新版本主题事件订阅和OSC协议迁移', '终端主题通知及查询已建立专项测试'],
  BASH_CLASSIFIER: ['核实新版权限与Shell分类功能', '旧开关原先未启用，不能直接开启'],
  BG_SESSIONS: ['迁移到新版后台会话管理', '新版包含后台任务和会话操作'],
  BRIDGE_MODE: ['保留新版远程会话能力', '校验只写镜像、消息发送、授权和恢复'],
  BUILDING_CLAUDE_APPS: ['复用原有基础并迁移新版API资源', '原有26份API资料需要对照新版清单'],
  CACHED_MICROCOMPACT: ['按新版两种工具结果清理路径迁移', '旧cache_edits与新版context_hint语义不同'],
  CHICAGO_MCP: ['保留Computer Use能力并移植原生执行链', '旧研究库只提供部分依赖源码'],
  CONTEXT_COLLAPSE: ['迁移新版压缩及413恢复', '旧提交日志与投影是否保留尚未证实'],
  COORDINATOR_MODE: ['核查新版任务编排生命周期', '旧多代理研究索引仅证明源码调用存在'],
  DIRECT_CONNECT: ['与新版远程会话和SDK消费者对照', '旧直接连接入口不自动等价'],
  EXPERIMENTAL_SKILL_SEARCH: ['迁移新版ToolSearch/技能发现', '目标版已具备动态工具发现'],
  FILE_PERSISTENCE: ['对照新版持久化和恢复机制', '旧数据结构不自动等价'],
  HISTORY_SNIP: ['核实新版历史裁剪消费者并迁移', '未确认同名裁剪算法仍存在'],
  KAIROS: ['核查正式版多代理和主动任务可达性', '旧研究显示大量私有门控'],
  KAIROS_BRIEF: ['复用旧代码并对照新版行为', 'PR7之前已有编译能力'],
  MCP_SKILLS: ['核对新版MCP技能和权限链路', '旧研究只保存源码引用'],
  MONITOR_TOOL: ['保留新版Monitor工具和任务状态', '目标版已有Monitor相关入口和原版运行证据'],
  OVERFLOW_TEST_TOOL: ['移除内部测试工具，保留真实溢出恢复', '正式外部版本无需旧测试工具'],
  PROACTIVE: ['核查新版正式功能可达性', '旧主动能力有私有服务条件'],
  TEAMMEM: ['核对新版任务记忆和多会话状态', '需要持久化与恢复验证'],
  TEMPLATES: ['清理旧独立命令入口，核实新版替代功能', '旧模板命令不在目标外部CLI入口'],
  TOKEN_BUDGET: ['迁移新版上下文预算和压缩阈值', '应对照实际token行为'],
  TRANSCRIPT_CLASSIFIER: ['复用旧代码并核对新版语义', 'PR7之前已有编译能力'],
  ULTRAPLAN: ['核查新版规划和审查实现', '旧独立规划开关不等于新版入口'],
  VOICE_MODE: ['按新版原生音频与权限实现', '旧研究没有设备运行验收'],
  WEB_BROWSER_TOOL: ['按新版浏览器MCP协议迁移', '必须验证扩展通信和工具授权'],
  WORKFLOW_SCRIPTS: ['迁移新版Workflow工具和状态管理', '目标版存在工作流入口及任务链'],
}
const rows = flags.map((flag, idx) => {
  const paths = flag.affected_sources
  if (!Array.isArray(paths)) throw new Error('旧版研究源路径格式错误')
  const changedBeforeReview = paths.filter(p => old.get(p) !== prior.get(p))
  const changedDuringReview = paths.filter(p => prior.get(p) !== current.get(p))
  const neverInBase = paths.filter(p => !old.has(p))
  const retiredAtCurrent = paths.filter(p => !current.has(p))
  const known = target[flag.flag]
  return {
    index: idx + 1,
    flag: flag.flag,
    legacyReferences: flag.references,
    legacyIndexedSourcePaths: paths,
    prePR7SourcePathCount: paths.filter(p => old.has(p)).length,
    prePR7Compiled: beforeEnabled.has(flag.flag),
    prePR7Status: beforeEnabled.has(flag.flag)
      ? '已进入旧版正式构建（不等于目标版签收）'
      : '研究索引可查询（旧正式构建没有请求该功能开关）',
    modifiedInPR7BeforeReview: changedBeforeReview,
    modifiedAfterReviewBaseline: changedDuringReview,
    missingAlreadyInPrePR7Source: neverInBase,
    removedSourcePathsInCurrentBranch: retiredAtCurrent,
    currentReleaseEnabled: enabled.has(flag.flag),
    targetHandling: known?.[0] ?? '需要依据2.1.310真实消费者判定保留、迁移或退场',
    targetReason: known?.[1] ?? '静态功能开关研究不足以证明新版去留',
    fullTargetAcceptance: 'NOT_SIGNED_OFF',
  }
})
if (new Set(rows.map(x => x.flag)).size !== 90) throw new Error('旧功能开关有重复')
const report = {
  schema: 1,
  generatedFrom: {
    prePR7Commit: BASELINE,
    originalResearch: 'research/claude-code-2.1.88/features/feature-index.json',
    beforeThisReview: BEFORE_REVIEW,
    current: currentHead,
    comparison: 'Git tree blob SHA for each original affected source path',
    targetVersion: '2.1.310',
  },
  summary: {
    legacyFlags: rows.length,
    compiledBeforePR7: rows.filter(x => x.prePR7Compiled).length,
    modifiedByPR7BeforeThisReview: rows.filter(x => x.modifiedInPR7BeforeReview.length).length,
    modifiedSinceReviewBaseline: rows.filter(x => x.modifiedAfterReviewBaseline.length).length,
    currentBuildEnabled: rows.filter(x => x.currentReleaseEnabled).length,
    targetHandlingDirectionDocumented: rows.filter(x => target[x.flag]).length,
    signedOff: 0,
  },
  rows,
}
mkdirSync(dirname(resolve(out)), { recursive: true })
writeFileSync(resolve(out), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report.summary))
