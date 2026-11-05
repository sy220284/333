#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) throw new Error('缺少依赖审计摘要文件');
const result = JSON.parse(readFileSync(file, 'utf8'));
if (!Array.isArray(result.high)) throw new Error('缺失可核验的高风险漏洞列表');
if (result.high.length !== 0) {
  console.error(`[333-security] 冻结依赖仍存在高危或严重漏洞：${result.high.map(x => x.name).join(', ')}`);
  process.exitCode = 1;
} else {
  console.log('[OK] 全量公开依赖高危/严重漏洞：0');
}
