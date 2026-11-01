#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const path = process.argv[2];
if (!path) throw new Error('缺少 npm audit JSON 路径');
const report = JSON.parse(readFileSync(path, 'utf8'));
if (!report.metadata?.vulnerabilities) {
  throw new Error('npm audit 未返回漏洞统计，可能发生网络错误: ' + JSON.stringify(report.error ?? report).slice(0, 1200));
}
const { info, low, moderate, high, critical, total } = report.metadata.vulnerabilities;
const summary = { info, low, moderate, high, critical, total };
console.log(`[333-security] 冻结依赖漏洞报告: ${JSON.stringify(summary)}`);
if (high || critical) {
  console.error(`[333-security] 高风险 ${high} 项、严重 ${critical} 项；审计报告见 CI 附件`);
  process.exitCode = 1;
} else {
  console.log('[OK] 未发现高风险及严重级别漏洞');
}
