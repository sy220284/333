#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const [kind, input, destination] = process.argv.slice(2);
if (!['types', 'audit'].includes(kind) || !input || !destination) {
  throw new Error('Usage: node tools/governance/summarize.mjs types|audit INPUT OUTPUT');
}
const raw = readFileSync(input, 'utf8');
let report;
if (kind === 'types') {
  const diagnostics = [...raw.matchAll(/^(.*?)\((\d+),(\d+)\): error (TS\d+): (.*)$/gm)].map(m => ({
    path: m[1].replaceAll('\\', '/').replace(/^\.\//, ''),
    line: Number(m[2]), column: Number(m[3]), code: m[4], message: m[5].trim(),
  }));
  if (!diagnostics.length && !raw.includes('Found 0 errors') && !raw.includes('[OK] 全量 TypeScript 类型检查通过')) {
    throw new Error('No parseable TypeScript diagnostics; check tool startup and log encoding: ' + raw.slice(-1200));
  }
  const byCode = Object.create(null);
  const byFile = Object.create(null);
  const byMessage = Object.create(null);
  for (const d of diagnostics) {
    byCode[d.code] = (byCode[d.code] ?? 0) + 1;
    byFile[d.path] = (byFile[d.path] ?? 0) + 1;
    const normalized = d.message.replace(/'[^']*'/g, '<标识符>').replace(/\b\d+\b/g, 'N');
    byMessage[normalized] = (byMessage[normalized] ?? 0) + 1;
  }
  const sort = obj => Object.entries(obj).sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  report = {
    total: diagnostics.length,
    affectedFiles: Object.keys(byFile).length,
    byCode: sort(byCode),
    topFiles: sort(byFile).slice(0, 100),
    topPatterns: sort(byMessage).slice(0, 80),
    diagnostics,
  };
} else {
  const audit = JSON.parse(raw);
  if (!audit.metadata?.vulnerabilities || !audit.vulnerabilities) {
    throw new Error('Invalid npm audit JSON; ensure npm registry was accessible');
  }
  const vulnerabilities = Object.values(audit.vulnerabilities).map(v => ({
    name: v.name, severity: v.severity, isDirect: v.isDirect, range: v.range,
    advisories: v.via.filter(x => typeof x === 'object').map(x => ({
      title: x.title, url: x.url, severity: x.severity, vulnerableRange: x.range,
    })),
    causedBy: v.via.filter(x => typeof x === 'string'),
    fixAvailable: v.fixAvailable,
    nodes: v.nodes,
  }));
  report = { ...audit.metadata, high: vulnerabilities.filter(x => ['high','critical'].includes(x.severity)), vulnerabilities };
}
mkdirSync(dirname(resolve(destination)), { recursive: true });
writeFileSync(destination, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({
  kind, output: destination,
  total: kind === 'types' ? report.total : report.vulnerabilities.length,
  topCodes: kind === 'types' ? report.byCode.slice(0, 12) : undefined,
  topFiles: kind === 'types' ? report.topFiles.slice(0, 10) : undefined,
  high: kind === 'audit' ? report.high.map(x => x.name) : undefined
}, null, 2));
