#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const source = readFileSync(resolve(root, 'src/entrypoints/sdk/coreSchemas.ts'), 'utf8');
const matches = [...source.matchAll(/^export const ([A-Za-z]\w*Schema)\s*=/gm)].map(match => match[1]);
if (!matches.length) throw new Error('coreSchemas.ts 未找到导出的模式声明');
const result = [
  "/** 由 tools/governance/regenerate-sdk-types.mjs 从 coreSchemas.ts 自动生成。请勿手改。 */",
  "import type { z } from 'zod/v4'",
  "import type * as schemas from './coreSchemas.js'",
  "",
  ...matches.map(name => `export type ${name.slice(0, -6)} = z.infer<ReturnType<typeof schemas.${name}>>`),
  "",
].join('\n');
const dest = resolve(root, 'src/entrypoints/sdk/coreTypes.generated.ts');
if (process.argv.includes('--check')) {
  if (readFileSync(dest, 'utf8') !== result) throw new Error('coreTypes.generated.ts 不符合 coreSchemas.ts 的最新类型');
  console.log(`[OK] ${matches.length} 项 SDK 类型与模式声明一致`);
} else {
  writeFileSync(dest, result);
  console.log(`[OK] 已生成 ${matches.length} 项强类型 SDK 声明`);
}
