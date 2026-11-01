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
const changes = [1, 2, 3].flatMap(i => readJson(join(evidenceDir, 'changelog-' + i + '.json')).records);
const coverage = readJson(join(root, 'docs/upgrade/upgrade-coverage.json'));

const validTasks = new Set(coverage.tasks.map(x => x.id));
const validFeatures = new Set(coverage.features.map(x => x.id));
const validScenarios = new Set(coverage.scenarios.map(x => x.id));
const hasText = x => typeof x === 'string' && x.trim().length > 0;
function verifiedFlag(f) {
  return f.target_category !== 'UNVERIFIED' &&
    hasText(f.target_category) && hasText(f.target_code_anchor) &&
    hasText(f.entry_consumer) && hasText(f.trigger_conditions) &&
    hasText(f.target_evidence) && f.related_F.every(x => validFeatures.has(x)) &&
    f.status === 'ACCEPTED';
}
function verifiedAnchor(f) {
  return ['CALL_CHAIN_CONFIRMED', 'TARGET_SEMANTICS_CONFIRMED', 'ACCEPTED'].includes(f.status) &&
    ['target_entry','consumer','permission_path','result_path','failure_path','cancellation_path',
    'resume_path','runtime_test','final_semantics'].every(key => hasText(f[key]));
}
function verifiedChange(x) {
  return x.review_status === 'ACCEPTED' &&
    hasText(x.final_2_1_310_behavior) && hasText(x.applicability) &&
    hasText(x.later_override) && x.evidence_level !== 'INDEXED' &&
    (x.related_F_confirmed.some(id => validFeatures.has(id)) ||
      (x.applicability === 'NOT_APPLICABLE' && hasText(x.scope_exclusion_evidence)));
}
function checkAll() {
  assert.equal(flagSet.length, 90, 'M1 requires exactly 90 legacy flags');
  assert.equal(flagSet.reduce((sum, f) => sum + f.legacy_count, 0), 972);
  assert.equal(new Set(flagSet.map(f => f.flag)).size, 90);
  for (const f of flagSet) {
    assert.match(f.flag, /^[A-Z][A-Z0-9_]+$/);
    assert.ok(validTasks.has(f.owner_M), 'Missing task responsibility: ' + f.flag);
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
    assert.equal(record.source_blob, source.official_changelog_blob);
    assert.ok(record.source_line > previousLine, 'Source line offsets are not ordered');
    previousLine = record.source_line;
    assert.ok(record.related_M_candidate.every(m => validTasks.has(m)));
    assert.ok(record.related_F_confirmed.every(f => validFeatures.has(f)));
  }
  const accepted = {
    flags: flagSet.filter(verifiedFlag).length,
    anchors: anchorSet.filter(verifiedAnchor).length,
    changes: changes.filter(verifiedChange).length,
  };
  return { source_blob:source.official_changelog_blob, source_archive_sha256:source.decompiled_library_sha256,
    total: { flags:90, anchors:61, changes:6313, versions:180, feature_links:coverage.features.length,
      scenario_links:coverage.scenarios.length }, accepted,
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
