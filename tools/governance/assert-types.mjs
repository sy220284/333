#!/usr/bin/env node
import { readFileSync } from 'node:fs';
const path=process.argv[2];
if (!path) throw new Error('缺少类型诊断报告');
const result=JSON.parse(readFileSync(path,'utf8'));
if (!Number.isInteger(result.total)) throw new Error('没有有效的类型诊断总数');
if (result.total) {
 console.error(`[333-governance] 全量类型错误仍有 ${result.total} 条，涉及 ${result.affectedFiles} 个文件；详见证据归档。必须继续修复后才能合并。`);
 process.exitCode=1;
} else console.log('[OK] TypeScript 全量类型检查无错误');
