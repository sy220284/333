#!/usr/bin/env node
// 用真实的功能契约和独立证据生成复核矩阵，不自动把专项测试当作 新版功能链 签收。
import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { resolve, dirname } from "node:path"
import { loadRegistry } from "../upgrade-feature-evidence-registry.mjs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const coverage = JSON.parse(readFileSync(resolve(root, "docs/upgrade/upgrade-coverage.json"), "utf8"))
const evidence = JSON.parse(readFileSync(resolve(root, "docs/upgrade/m1-evidence/verified-runtime-evidence.json"), "utf8"))
// Signed acceptance comes only from the independently validated 新版功能链 registry.
// The coverage catalog deliberately remains UNVERIFIED to prevent code changes
// or focused tests from silently signing off end-to-end behavior.
const registry = loadRegistry()
const signedFeatures = new Set(registry.features.filter(f => f.acceptance === "VERIFIED").map(f => f.id))
if (coverage.features.length !== coverage.counts.features || coverage.scenarios.length !== coverage.counts.scenarios) {
  throw Error("能力或场景总数与总台账不一致")
}
const features = new Map(coverage.features.map(x => [x.id, x]))
const scenarios = new Set(coverage.scenarios.map(x => x.id))
for (const [id, entry] of Object.entries(evidence.features)) {
  if (!features.has(id)) throw Error(`证据引用未登记的能力 ${id}`)
  if (!Array.isArray(entry.tests) || !entry.tests.length) throw Error(`能力 ${id} 缺少测试证据`)
  for (const test of entry.tests) {
    if (!test.source || !test.result || !test.scope) throw Error(`能力 ${id} 的测试缺少来源/结论/适用范围`)
  }
  for (const sid of entry.scenarios ?? []) {
    if (!scenarios.has(sid)) throw Error(`能力 ${id} 引用未知场景 ${sid}`)
    if (!features.get(id).scenarios.includes(sid)) throw Error(`能力 ${id} 未关联场景 ${sid}`)
  }
}
const rows = coverage.features.map(f => ({
  id: f.id, title: f.title, status: signedFeatures.has(f.id) ? "VERIFIED" : "UNVERIFIED",
  scenario_count: f.scenarios.length,
  evidence: evidence.features[f.id]?.tests ?? [],
  next_checks: evidence.features[f.id]?.remaining ?? ["待建立新版原版执行对照与产品入口回归证据"],
}))
const formallyAccepted = registry.counts.signed_features
const covered = rows.filter(r => r.evidence.length).length
const report = {schema:1, target_version:coverage.target_version,
  source:"docs/upgrade/upgrade-coverage.json", evidence_source:"docs/upgrade/m1-evidence/verified-runtime-evidence.json",
  summary:{features:rows.length, scenarios:coverage.scenarios.length, evidence_linked:covered, formally_accepted:formallyAccepted},
  note:"evidence_linked 仅表示已有指向具体功能的测试证据，正式完成须以功能全链路、官方 x64 对照及 新版功能链 签收为准",
  features:rows}
const out = resolve(root, "docs/upgrade/m1-evidence/runtime-acceptance-matrix.json")
if (process.argv.includes("--check")) {
  const actual = JSON.parse(readFileSync(out, "utf8"))
  if (JSON.stringify(actual) !== JSON.stringify(report)) throw Error("运行证据矩阵与源文件不同步；请重新生成")
  console.log(`证据矩阵有效：${rows.length} 项，${covered} 项已有专项证据，${formallyAccepted} 项正式签收`)
} else {
  writeFileSync(out, `${JSON.stringify(report,null,2)}\n`)
  console.log(`已更新 ${out}，${covered}/${rows.length} 项含专项证据`)
}
