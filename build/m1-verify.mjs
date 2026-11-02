import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const evidenceDir = join(root, 'docs/upgrade/m1-evidence');
const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const source = readJson(join(evidenceDir, 'source-provenance.json'));
const flagSet = readJson(join(evidenceDir, 'old-flags.json')).records;
const anchorSet = readJson(join(evidenceDir, 'new-code-anchors.json')).records;
const changes = [1, 2, 3].flatMap(i => {
  const part = readJson(join(evidenceDir, 'changelog-' + i + '.json'));
  assert.equal(part.source_blob ?? source.official_changelog_blob, source.official_changelog_blob);
  return part.records;
});
// Each reviewed change stays separate from the immutable original release index.
// Never count a lexical candidate as a signed-off semantic update.
const releaseReviews = readJson(join(evidenceDir, 'release-semantic-review.json')).items;
const changeById = new Map(changes.map(row => [row.id, row]));
assert.equal(changeById.size, 6313, 'Original source rows must stay unique');
assert.equal(new Set(releaseReviews.map(row => row.id)).size, releaseReviews.length);
for(const reviewed of releaseReviews) {
  const row = changeById.get(reviewed.id);
  assert.ok(row, 'Unknown reviewed changelog item: ' + reviewed.id);
  assert.equal(reviewed.source_line, row.source_line);
  assert.equal(reviewed.source_blob, source.official_changelog_blob);
  assert.equal(reviewed.evidence_level, 'TARGET_SOURCE_CONFIRMED');
  assert.ok(Array.isArray(reviewed.related_F_confirmed) &&
            reviewed.related_F_confirmed.length>0);
  assert.ok(Array.isArray(reviewed.target_code_anchors) &&
            reviewed.target_code_anchors.length>0);
  assert.ok(Array.isArray(reviewed.tests) && reviewed.tests.length>0);
  for(const path of [...reviewed.implemented_source,...reviewed.tests]) {
    assert.ok(existsSync(join(root,path)), 'Missing implementation or test: '+path);
  }
  // Preserve original release description and source position; overlays may
  // only set reviewed semantics and implementation proof fields.
  for(const key of ['source_text','version','ordinal','verb_candidate','related_M_candidate']) {
    assert.equal(reviewed[key], undefined, 'Reviewed overlay must not rewrite immutable source field '+key);
  }
  Object.assign(row, {
    review_status:reviewed.review_status,
    evidence_level:reviewed.evidence_level,
    applicability:reviewed.applicability,
    final_2_1_310_behavior:reviewed.final_2_1_310_behavior,
    later_override:reviewed.later_override,
    owner_M_verified:reviewed.owner_M_verified,
    related_F_confirmed:reviewed.related_F_confirmed,
    scope_exclusion_evidence:reviewed.scope_exclusion_evidence,
  });
}
const coverage = readJson(join(root, 'docs/upgrade/upgrade-coverage.json'));
const routing = readJson(join(evidenceDir, '功能差分与任务承接.json'));
const legacyCallSites = readJson(join(evidenceDir, 'legacy-call-sites.json'));
const plannedByF = new Map(coverage.features.map(f => [f.id, f.tasks.filter(t => /^M[2-9]$/.test(t))]));

const validTasks = new Set(coverage.tasks.map(x => x.id));
const validFeatures = new Set(coverage.features.map(x => x.id));
const validScenarios = new Set(coverage.scenarios.map(x => x.id));
const hasText = x => typeof x === 'string' && x.trim().length > 0;
function verifiedFlag(f) {
  const row = routing.flags.find(item => item.flag === f.flag);
  if (!row) return false;
  return row.target_formalized !== 'UNVERIFIED' &&
    hasText(row.target_formalized) &&
    hasText(row.target_behavior_source) &&
    hasText(row.old_vs_new_delta) &&
    hasText(row.enable_conditions) &&
    row.assignment_verified === 'CODE_REVIEWED' &&
    (row.M1_required
      ? row.status === 'M1_IMPLEMENTED_TESTED_OR_INTERNAL_VERIFIED'
      : row.status === 'M1_SOURCE_VERIFIED_AND_HANDOFF_READY');
}
function verifiedAnchor(f) {
  const row = routing.chain_features.find(item => item.id === f.F_id);
  if (!row) return false;
  return row.is_added_in_2_1_310 !== 'UNVERIFIED' &&
    row.old_presence_class !== 'OLD_EQUIVALENT_NOT_LOCATED' &&
    row.target_full_chain !== 'UNVERIFIED' &&
    hasText(row.delta_from_2_1_88) &&
    hasText(row.new_source_evidence) &&
    (row.M1_required
      ? row.status === 'M1_IMPLEMENTED_TESTED'
      : row.status === 'M1_SOURCE_VERIFIED_AND_HANDOFF_READY');
}
function verifiedChange(x) {
  // M1 confirms version-specific target semantics and implementation owner.
  // Runtime F/E/L acceptance belongs to M2-M9, with final M10 signoff.
  return x.review_status === 'M1_CLASSIFIED' &&
    hasText(x.final_2_1_310_behavior) &&
    hasText(x.applicability) &&
    hasText(x.later_override) &&
    hasText(x.owner_M_verified) &&
    (x.related_F_confirmed.some(id => validFeatures.has(id)) ||
     (x.applicability === 'NOT_APPLICABLE' &&
      hasText(x.scope_exclusion_evidence))) &&
    (x.evidence_level === 'TARGET_SOURCE_CONFIRMED' ||
     x.evidence_level === 'CHANGELOG_UNSPECIFIED_WITH_BOUNDARY');
}
function checkAll() {
  const originalFlags = readJson(join(root, 'research/claude-code-2.1.88/features/feature-index.json'));
  const gapDoc = readFileSync(join(root, 'docs/upgrade/2.1.310-升级缺口与逐项核查清单.md'), 'utf8');
  const standardsDoc = readFileSync(join(root, 'docs/upgrade/2.1.310-三项全量证据补证与关单规范.md'), 'utf8');
  const originalByName = new Map(originalFlags.map(item => [item.flag, item]));
  const gapByName = new Map([...gapDoc.matchAll(/^\|\s*`([A-Z][A-Z0-9_]+)`\s*\|\s*\d+\s*\|\s*[^|]+\|\s*(M\d+)\s*\|/gm)]
    .map(match => [match[1], match[2]]));
  assert.equal(originalByName.size, 90);
  assert.equal(gapByName.size, 90);
  const standardsById = new Map([...standardsDoc.matchAll(/^\|\s*(F\d{3})\s*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`/gm)]
    .map(match => [match[1], {anchor: match[2], keyword: match[3]}]));
  assert.equal(standardsById.size, 61);
  const missingModules = readJson(join(evidenceDir, 'missing-modules.json')).records;
  assert.deepEqual(missingModules.map(row => row.module).sort(),
    ['VerifyPlanExecutionTool','snipCompact','SnapshotUpdateDialog','AssistantSessionChooser',
    'assistant','cachedMicrocompact','contextCollapse'].sort());
  assert.ok(missingModules.every(row => ['UNVERIFIED', 'RETIRED_WITH_NOOP'].includes(row.target_state)));
  for (const row of missingModules) {
    if (row.target_state !== 'RETIRED_WITH_NOOP') continue;
    assert.equal(row.module, 'SnapshotUpdateDialog',
      'Do not mark other missing modules retired without a verified target source contract');
    assert.match(row.new_execution_path, /chunk-0x2m04n3\.js:684/);
    assert.match(row.comparison_evidence, /return "keep"/);
    assert.equal(row.M1_evidence_grade, 'TARGET_SOURCE_CONTRACT_CONFIRMED');
  }

  assert.equal(legacyCallSites.total_flags, 90);
  assert.equal(legacyCallSites.total_legacy_refs, 972);
  assert.equal(legacyCallSites.records.length, 90);
  const calledByFlag = new Map(legacyCallSites.records.map(item => [item.flag, item]));
  assert.equal(calledByFlag.size, 90);
  assert.equal(flagSet.length, 90, 'M1 requires exactly 90 legacy flags');
  assert.equal(flagSet.reduce((sum, f) => sum + f.legacy_count, 0), 972);
  assert.equal(new Set(flagSet.map(f => f.flag)).size, 90);
  for (const f of flagSet) {
    assert.match(f.flag, /^[A-Z][A-Z0-9_]+$/);
    assert.ok(validTasks.has(f.owner_M), 'Missing task responsibility: ' + f.flag);
    const original = originalByName.get(f.flag);
    assert.ok(original, 'Legacy flag missing from original research: '+f.flag);
    assert.equal(f.legacy_count, original.references);
    assert.deepEqual(f.old_sources, original.affected_sources);
    assert.equal(f.old_compilation_state, original.compilation_state_333);
    assert.equal(f.owner_M, gapByName.get(f.flag));
    const calls=calledByFlag.get(f.flag);
    assert.ok(calls, 'Missing exact legacy caller '+f.flag);
    assert.equal(calls.source_references.length, f.legacy_count);
    assert.ok(calls.source_references.every(site =>
      typeof site.source === 'string' && site.source.startsWith('src/') &&
      Number.isInteger(site.line) && site.line>0 && hasText(site.context)));
    assert.ok(calls.source_references.every(site =>
      site.context.includes('feature(') || site.context.includes('feature (') ||
      site.context.includes(f.flag)), 'Missing original feature guard');
    assert.ok(Array.isArray(f.old_sources) && f.old_sources.length > 0);
    assert.ok(['INDEXED','ANCHOR_IDENTIFIED','CALL_CHAIN_CONFIRMED','TARGET_SEMANTICS_CONFIRMED',
      'IMPLEMENTED','TESTED','ACCEPTED'].includes(f.status));
  }

  assert.equal(anchorSet.length, 61, 'M1 requires exactly 61 target code anchors');
  assert.equal(new Set(anchorSet.map(x => x.F_id)).size, 61);
  for (const item of anchorSet) {
    assert.ok(validFeatures.has(item.F_id), 'Unmapped feature: ' + item.F_id);
    assert.match(item.first_code_anchor, /^chunk-[a-z0-9]+\.js:\d+$/);
    assert.ok(hasText(item.static_keyword));
    assert.ok(Array.isArray(item.candidate_evidence) && item.candidate_evidence.length>0);
    assert.equal(item.candidate_count,item.candidate_evidence.length);
    for(const candidate of item.candidate_evidence){
      assert.match(candidate.location,/^chunk-[a-z0-9]+\.js:\d+$/);
      assert.ok(hasText(candidate.code_snippet));
      assert.equal(candidate.release_runtime_verified,false,
        'A static snippet cannot be treated as verified runtime execution');
    }
    const first = standardsById.get(item.F_id);
    assert.ok(first, 'Missing feature from M1 source standard');
    assert.equal(item.first_code_anchor, first.anchor);
    assert.equal(item.static_keyword, first.keyword);
    assert.ok(Array.isArray(item.old_sources));
    assert.ok(item.owner_M.every(m => validTasks.has(m)));
    assert.ok(item.related_scenarios.length > 0);
    for(const scenario of item.related_scenarios) assert.ok(validScenarios.has(scenario));
  }

  assert.equal(changes.length, 6313, 'M1 requires all 6313 official changes');
  assert.equal(new Set(changes.map(x => x.id)).size, 6313);
  assert.equal(new Set(changes.map(x => x.version)).size, 180);
  const expected = new Map();
  let previousLine = 0;
  for (const record of changes) {
    const num = (expected.get(record.version) ?? 0) + 1;
    expected.set(record.version, num);
    assert.equal(record.ordinal, num, 'Missing or repeated changelog ordinal: '+record.id);
    assert.equal(record.id, record.version + '#' + String(num).padStart(3,'0'));
    assert.equal(record.source_blob ?? source.official_changelog_blob, source.official_changelog_blob);
    assert.ok(record.source_line > previousLine, 'Source line offsets are not ordered');
    previousLine = record.source_line;
    assert.ok(record.related_M_candidate.every(m => validTasks.has(m)));
    assert.ok(record.related_F_confirmed.every(f => validFeatures.has(f)));
  }
  // An old compiler switch is not an upgrade task by itself: its target
  // behavior must be mapped to a real implementation task. Or M1 must own it.
  assert.equal(routing.flags.length, 90);
  assert.equal(routing.chain_features.length, 61);
  const flagByName = new Map(routing.flags.map(x => [x.flag, x]));
  const chainById = new Map(routing.chain_features.map(x => [x.id, x]));
  assert.equal(flagByName.size, 90);
  assert.equal(chainById.size, 61);
  for (const entry of flagSet) {
    const mapped = flagByName.get(entry.flag);
    assert.ok(mapped, 'M1 old flag missing classification: '+entry.flag);
    assert.equal(mapped.old_references, entry.legacy_count);
    assert.ok(hasText(mapped.target_behavior_source),
      'Legacy flag lacks a reviewed target branch or recorded mismatch: ' + mapped.flag);
    assert.ok(hasText(mapped.old_vs_new_delta),
      'Legacy flag lacks an old/new functional comparison: ' + mapped.flag);
    assert.ok(hasText(mapped.verified_next_implementation_task) || mapped.M1_required,
      'Legacy flag lacks precise M2-M9 implementation handoff: ' + mapped.flag);
    if (mapped.status === 'TARGET_BEHAVIOR_NOT_VERIFIED') {
      assert.notEqual(mapped.assignment_verified, 'CODE_REVIEWED',
        'A source candidate must not claim final branch verification');
    }
    assert.ok(mapped.related_F_candidate.every(id => validFeatures.has(id)));
    const actualTasks = [...new Set(mapped.related_F_candidate.flatMap(id => plannedByF.get(id) ?? []))].sort();
    assert.deepEqual(mapped.developer_cards.map(x => x.M).sort(), actualTasks);
    assert.equal(mapped.M1_required, actualTasks.length === 0 || mapped.related_F_candidate.includes('F080'),
      'M1 responsibility missing: '+mapped.flag);
    assert.equal(mapped.M1_required || mapped.developer_cards.length>0,true);
  }
  for (const entry of anchorSet) {
    const mapped = chainById.get(entry.F_id);
    assert.ok(mapped,'M1 new-chain missing classification: '+entry.F_id);
    assert.equal(mapped.target_first_anchor,entry.first_code_anchor);
    assert.deepEqual(mapped.downstream_tasks, plannedByF.get(entry.F_id));
    assert.equal(mapped.M1_required,mapped.downstream_tasks.length === 0,
      'M1 must implement any uncovered newly discovered feature: '+entry.F_id);
    assert.ok(mapped.M1_required || mapped.downstream_tasks.length > 0);
  }
  assert.deepEqual(routing.chain_features.filter(x => x.M1_required).map(x=>x.id),['F080']);
  // The single currently uncovered capability has implementation in M1.
  const telemetryPolicy=readFileSync(join(root,'src/utils/telemetry/projectTelemetryPolicy.mjs'),'utf8');
  const envIntegration=readFileSync(join(root,'src/utils/managedEnv.ts'),'utf8');
  assert.ok(telemetryPolicy.includes('isPrivilegedTelemetrySetting'));
  assert.equal((envIntegration.match(/resolveProjectTelemetryEnv\(/g)??[]).length,2,
    'F080 privacy policy must apply before trust and after trust');

  assert.equal(anchorSet.reduce((n,x)=>n+x.candidate_evidence.length,0),287,
    'M1 requires all 287 static candidate source samples');
  assert.equal(routing.flags.filter(x=>x.target_static_leads?.length).length,89);
  assert.ok(routing.flags.every(x => x.target_lead_assessment),
    'All 90 flags require candidate evidence and misleading-hit classification');
  assert.ok(routing.flags.filter(x=>x.static_lead_is_equivalent===false).length>=20,
    'Potential false-positive keyword matches must be retained for manual review');
  assert.ok(routing.flags.some(x=>x.flag==='ULTRAPLAN' && x.target_formalized.includes('NOT_DEFAULT_PUBLIC_FEATURE')),
    'Historical removal must be checked against surviving gated target entry');
  const accepted = {
    flags: flagSet.filter(verifiedFlag).length,
    anchors: anchorSet.filter(verifiedAnchor).length,
    changes: changes.filter(verifiedChange).length,
  };
  return { source_blob:source.official_changelog_blob, source_archive_sha256:source.decompiled_library_sha256,
    total: { flags:90, anchors:61, changes:6313, versions:180, feature_links:coverage.features.length,
      scenario_links:coverage.scenarios.length }, accepted,
    source_review: {
      flags_first_pass_with_comparison: routing.flags.filter(r => hasText(r.target_behavior_source) && hasText(r.old_vs_new_delta)).length,
      functions_with_actual_entry_and_consumer: routing.chain_features.filter(r => Boolean(r.target_verified_source_branches?.length)).length,
      release_semantics_source_confirmed:releaseReviews.filter(r => r.review_status === 'M1_CLASSIFIED').length,
      release_semantics_without_signoff:6313-releaseReviews.filter(r => r.review_status === 'M1_CLASSIFIED').length,
    },
    m1_closed: accepted.flags===90 && accepted.anchors===61 && accepted.changes===6313 };
}
function verifyOfficialChangelog(path) {
  const raw = readFileSync(path);
  const gitBlob = createHash('sha1')
    .update('blob ' + raw.length + '\0').update(raw).digest('hex');
  assert.equal(gitBlob, source.official_changelog_blob, 'Official changelog blob changed');
  const lines = raw.toString('utf8').split(/\r?\n/);
  let version = null, ordinal = 0, cursor = 0;
  for(let i=0;i<lines.length;i++){
    const v = /^## (2\.1\.\d+)\s*$/.exec(lines[i]);
    if(v){
      version = v[1];
      if(Number(version.split('.')[2])<=88)break;
      ordinal=0;continue;
    }
    if(!version || !lines[i].startsWith('- '))continue;
    ordinal++;
    const row=changes[cursor++];
    assert.ok(row, 'Unexpected changelog addition at line '+(i+1));
    assert.equal(row.version,version);
    assert.equal(row.ordinal,ordinal);
    assert.equal(row.source_line,i+1);
    assert.equal(row.source_length,lines[i].slice(2).trim().length);
    assert.equal(row.source_text,lines[i].slice(2).trim(),
      'Official changelog source text differs at '+row.id);
  }
  assert.equal(cursor,6313,'Official changelog row count differs');
}
function verifyDecompiledAnchors(dir) {
  const base=resolve(dir);
  let count=0;
  for (const item of anchorSet) {
    const [filename,n] = item.first_code_anchor.split(':');
    const path=join(base,filename);
    assert.ok(existsSync(path),'Source missing: '+path);
    const content=readFileSync(path,'utf8').split(/\r?\n/);
    const line=content[Number(n)-1];
    assert.ok(line?.toLowerCase().includes(item.static_keyword.toLowerCase()),
      'Code anchor mismatch for '+item.F_id+' at '+item.first_code_anchor);
    count++;
  }
  return count;
}
const result=checkAll();
const argv=process.argv.slice(2);
const index=argv.indexOf('--changelog');
if(index>=0){ assert.ok(argv[index+1],'Missing --changelog file');verifyOfficialChangelog(argv[index+1]);result.changelog_source_verified=true; }
const decompileIndex=argv.indexOf('--decompiled-dir');
if(decompileIndex>=0){ assert.ok(argv[decompileIndex+1],'Missing decompiled source dir');
  result.decompiled_anchors_verified=verifyDecompiledAnchors(argv[decompileIndex+1]); }
console.log(JSON.stringify(result,null,2));
if (argv.includes('--require-closed')) {
  assert.ok(result.m1_closed,'M1 acceptance denied: missing semantic and runtime evidence for flags, anchors or changes');
}
