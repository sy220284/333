// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{b,f}from"./chunk-hd335g9m.js";import{N,d,_W}from"./chunk-5x4vp4dg.js";import{K,ve}from"./chunk-wxyh2ndv.js";import{W}from"./chunk-agahg8zh.js";import{t}from"./chunk-qx8w2w8f.js";import{M}from"./chunk-sctdt2my.js";import{a}from"./chunk-sqwfq8wd.js";import{g,m}from"./chunk-5s4g6bgt.js";import{jV}from"./chunk-bjevk2dr.js";import{Xn}from"./chunk-gfgmnhge.js";import{ft}from"./chunk-mf6cjfte.js";import{_a,v,wp,Na,TY}from"./chunk-yx0yvz1d.js";import{at,Vt}from"./chunk-tm88cq46.js";import{tJ,HP,MKt,Le,Nt,xnr}from"./chunk-thp9mgjc.js";import{Sfr,tne,D4}from"./chunk-z227w65w.js";import{bp,l0,X3e}from"./chunk-fwz1t5by.js";import{dw}from"./chunk-71r0wa08.js";import{wzn,Ezn,fLr,pLr,mLr,THe,gLr}from"./chunk-xdy0fpaj.js";import{E_t,tjs,KUt,njs}from"./chunk-mn9nxf0x.js";import{AE,by}from"./chunk-91mtjsdc.js";import{Xp}from"./chunk-8gbwhhd5.js";import{IE,Mg,tf}from"./chunk-cf84r0hk.js";function J(){return v("tengu_onyx_plover",null)}function ean(){let e=J();return e?.enabled===!0||e?.available===!0}function Kyt(){if(!ean())return!1;let e=ft().autoDreamEnabled;if(e!==void 0)return e;return J()?.enabled===!0}class Z{runner=null}var B=new W(()=>new Z);var le="## Team memory (`team/` subdirectory)\n\nThe `team/` subdirectory holds memories shared across everyone working in this repo. Other teammates' Claude sessions write here too \u2014 treat it differently from your personal files:\n\n- **Phase 1:** `ls team/` and skim it alongside your personal files. A teammate may have already captured something you'd otherwise duplicate.\n- **Phase 3:** Merge near-duplicates *within* `team/` the same way you would personal memories. If a personal memory restates a team memory, delete the personal one.\n- **Phase 4 \u2014 be conservative pruning `team/`:**\n  - DO delete or fix a team memory that is clearly contradicted by the current code, or that a newer team memory marks as superseded.\n  - DO NOT delete a team memory just because you don't recognize it or it isn't relevant to *your* recent sessions \u2014 a teammate may rely on it.\n  - When unsure, leave it. A stale team memory costs little; deleting a teammate's load-bearing note costs a lot.\n\nDo not promote personal memories into `team/` during a dream \u2014 that's a deliberate choice the user makes via `/remember`, not something to do reflexively.",de=`### Reconcile memories against CLAUDE.md

Project CLAUDE.md instructions are loaded in your system prompt. For each memory that captures feedback or project conventions (the \`feedback\`/\`project\` types, where tagged), check whether it contradicts a CLAUDE.md instruction on the same topic:

- **Memory is stale** \u2014 CLAUDE.md and the memory describe different procedures for the same task: CLAUDE.md is the maintained, checked-in source. Delete the memory, or rewrite it to agree if it carries context worth keeping (the *why* is still useful but the *how* is wrong).
- **CLAUDE.md may be stale** \u2014 the memory is clearly dated after CLAUDE.md and explicitly corrects it: do NOT edit CLAUDE.md during a dream. Annotate the memory with "contradicts CLAUDE.md \u2014 verify which is current" and list it in your summary so the user can update CLAUDE.md.
- **Not a conflict** \u2014 the memory adds detail CLAUDE.md doesn't cover, or narrows a CLAUDE.md rule with a stated reason. Leave it.

A \`feedback\` memory's "Why: the user corrected me" framing is not evidence it's newer than CLAUDE.md \u2014 CLAUDE.md may have been updated since.`;function Q(e,r,o,y=!1,c=!1,s=!1){return`# Dream: Memory Consolidation

You are performing a dream \u2014 a reflective pass over your memory files. Synthesize what you've learned recently into durable, well-organized memories so that future sessions can orient quickly.

Memory directory: \`${e}\`
${X3e}

Session transcripts: \`${r}\` (large JSONL files \u2014 grep narrowly, don't read whole files)
${y?`
${le}
`:""}
---

## Phase 1 \u2014 Orient

- \`ls\` the memory directory to see what already exists
- Read \`${bp}\` to understand the current index
- Skim existing topic files so you improve them rather than creating duplicates
- If a \`sessions/\` subdirectory exists, review recent entries there

## Phase 2 \u2014 Gather recent signal

Look for new information worth persisting. Sources in rough priority order:

1. **Existing memories that drifted** \u2014 facts that contradict something you see in the codebase now
2. **Transcript search** \u2014 if you need specific context (e.g., "what was the error message from yesterday's build failure?"), grep the JSONL transcripts for narrow terms:
   \`grep -rn "<narrow term>" ${r}/ --include="*.jsonl" | tail -50\`

Don't exhaustively read transcripts. Look only for things you already suspect matter.

## Phase 3 \u2014 Consolidate

For each thing worth remembering, write or update a memory file at the top level of the memory directory. Use the memory file format and type conventions from your system prompt's auto-memory section \u2014 it's the source of truth for what to save, how to structure it, and what NOT to save.${c?` The ${IE} / ${Mg} / ${tf} tools are unavailable in a dream: consolidate only this memory directory, and leave anything that section marks as shared with the project where it is \u2014 never copy it into these files.`:""}${""}

Focus on:
- Merging new signal into existing topic files rather than creating near-duplicates
- Converting relative dates ("yesterday", "last week") to absolute dates so they remain interpretable after time passes
- Deleting contradicted facts \u2014 if today's investigation disproves an old memory, fix it at the source

## Phase 4 \u2014 Prune and index

Update \`${bp}\` so it stays under ${l0} lines AND under ~25KB. It's an **index**, not a dump \u2014 each entry should be one line under ~150 characters: \`- [Title](file.md) \u2014 one-line hook\`. Never write memory content directly into it.

- Remove pointers to memories that are now stale, wrong, or superseded
- Demote verbose entries: if an index line is over ~200 chars, it's carrying content that belongs in the topic file \u2014 shorten the line, move the detail
- Add pointers to newly important memories
- Resolve contradictions \u2014 if two files disagree, fix the wrong one

${de}

---

Return a brief summary of what you consolidated, updated, or pruned. If nothing changed (memories are already tight), say so.${o?`

## Additional context

${o}`:""}`}var ue=30;function Y(e){return typeof e==="object"&&e!==null&&"type"in e&&e.type==="dream"}function ee(e,r){let o=AE("dream"),y={...by(o,"dream","dreaming"),type:"dream",status:"running",skipTranscript:!0,phase:"starting",sessionsReviewing:r.sessionsReviewing,filesTouched:[],turns:[],abortController:r.abortController,priorMtime:r.priorMtime,...r.storageV5!==void 0&&{storageV5:r.storageV5}};return e.register(y),o}function te(e,r,o,y){y.update(e,(c)=>{let s=new Set(c.filesTouched),i=o.filter((n)=>!s.has(n)&&s.add(n));if(r.text===""&&r.toolUseCount===0&&i.length===0)return c;return{...c,phase:i.length>0?"updating":c.phase,filesTouched:i.length>0?[...c.filesTouched,...i]:c.filesTouched,turns:c.turns.slice(-(ue-1)).concat(r)}})}function re(e,r){r.update(e,(o)=>({...o,status:"completed",endTime:Date.now(),notified:!0,abortController:void 0})),g("task_dream"),_a(e,"completed",{skipTranscript:!0,ambient:!0})}function oe(e,r){r.update(e,(o)=>({...o,status:"failed",endTime:Date.now(),notified:!0,abortController:void 0})),m("task_dream","task_dream_failed"),_a(e,"failed",{skipTranscript:!0,ambient:!0})}var w=null,ce=600000,pe=new RegExp(`^\\s*(?:${pLr})\\b`,"i"),se={minHours:24,minSessions:5};function fe(){let e=v("tengu_onyx_plover",null);return{minHours:typeof e?.minHours==="number"&&Number.isFinite(e.minHours)&&e.minHours>0?e.minHours:se.minHours,minSessions:typeof e?.minSessions==="number"&&Number.isFinite(e.minSessions)&&e.minSessions>0?e.minSessions:se.minSessions}}function he(){if(Xn()!==null)return!1;if(jV())return!1;if(!wp())return!1;if(tne())return!1;return Kyt()}function ge(){return!1}function CFs(e){let r=0,o=!1,y=new Set;B.of(e).runner=async function(s,i){let n=fe(),u=ge();if(!u&&!he())return;let E;try{E=await E_t(void 0,s.toolUseContext.storageV5)}catch(l){t(`[autoDream] readLastConsolidatedAt failed: ${d(l)}`);return}let P=(Date.now()-E)/3600000;if(!u&&P<n.minHours)return;let q=Date.now()-r;if(!u&&q<ce){t(`[autoDream] scan throttle \u2014 time-gate passed but last scan was ${Math.round(q/1000)}s ago`);return}r=Date.now();let p;try{p=await njs(E,s.toolUseContext.storageV5)}catch(l){t(`[autoDream] listSessionsTouchedSince failed: ${d(l)}`);return}let ae=K();if(p=p.filter((l)=>l!==ae),!u&&p.length<n.minSessions){t(`[autoDream] skip \u2014 ${p.length} sessions since last consolidation, need ${n.minSessions}`),a("tengu_auto_dream_skipped",{reason:b("sessions"),session_count:p.length,min_required:n.minSessions});return}let I=mLr(s.toolUseContext.getAppState().toolPermissionContext,TY());if(I!==void 0){if(t(`[autoDream] skip \u2014 ${Ezn(I)} would refuse memory writes`),a("tengu_auto_dream_skipped",{reason:b("permission_rule")}),i!==void 0){let l=fLr(e,I,Na());if(l!==void 0)i(Nt(l,"warning"))}return}let D;if(u)D=E;else{try{D=await tjs(s.toolUseContext.storageV5)}catch(l){t(`[autoDream] lock acquire failed: ${d(l)}`);return}if(D===null){a("tengu_auto_dream_skipped",{reason:b("lock")});return}}let S=Na(),x=void 0,h=x==="unplaced"||x==="capped"?void 0:x;if(h==="newer"||h!==void 0&&"unreadable"in h){if(!u)await KUt(D,s.toolUseContext.storageV5);if(h!=="newer"){if(t(`[autoDream] skipped: the memory items could not be read (cause: ${h.unreadable}); the warning above says why and what resumes consolidation`),a("tengu_auto_dream_skipped",{reason:b("items_unreadable")}),w!==null&&i!==void 0&&!y.has(h.unreadable))y.add(h.unreadable),i?.(Nt(await w.unreadableItemsNotice(h.unreadable,S),"warning"));return}if(t("[autoDream] skip \u2014 newer item record"),a("tengu_auto_dream_skipped",{reason:b("record_newer")}),w!==null&&i!==void 0&&!o)o=!0,i?.(Nt(w.NEWER_RECORD_NOTICE,"warning"));return}let F=D4();t(`[autoDream] firing \u2014 ${P.toFixed(1)}h since last, ${p.length} sessions to review`),a("tengu_auto_dream_fired",{hours_since:Math.round(P),sessions_since:p.length,team_memory_enabled:F});let{taskRegistry:R}=s.toolUseContext,C=new AbortController,L=ee(R,{sessionsReviewing:p.length,priorMtime:D,abortController:C,storageV5:s.toolUseContext.storageV5}),U="fork";try{let l=dw(ve()),z=`

**Tool constraints for this run:** Shell access is restricted to read-only commands (\`ls\`, \`find\`, \`grep\`, \`cat\`, \`stat\`, \`wc\`, \`head\`, \`tail\`, and similar) plus deleting \`.md\` files inside the memory directory (outside protected subdirectories like \`.git\` or \`agents\`; \`rm\` takes no flags except \`-f\`). Anything else that writes, redirects to a file, or modifies state will be denied. Plan your exploration with this in mind.

Sessions since last consolidation (${p.length}):
${p.map((_)=>`- ${_}`).join(`
`)}`,we=!1,ne=Q(S,l,z,F,Sfr(),!1),ie=_e(L,R,S),H=new Map,j=new Set,G=!1,X=!1,V=!1,A;try{A=await HP({promptMessages:[Le({content:ne})],cacheSafeParams:tJ(s),canUseTool:gLr(S,h!==void 0?w?.keptItemsOf(h):void 0,{fork:"dream",onWriteAllowed:(_,O)=>H.set(O,_)}),querySource:"auto_dream",forkLabel:"auto_dream",skipTranscript:!0,overrides:{abortController:C},onMessage:(_)=>{if(ie(_),ye(_,j),_.type==="assistant")G=_.isApiErrorMessage===!0},skipCacheWrite:MKt()}),X=!0,V=!C.signal.aborted&&!G}finally{let _=new Set([...H].filter(([k])=>!V||!j.has(k)).map(([,k])=>k)),O=new Set([...H].filter(([k])=>V&&j.has(k)).map(([,k])=>k));if(w!==null&&x==="capped")await w.deferCappedRunWrites({memoryDir:S,dreamWrote:_,mayHaveWritten:O});if(w!==null&&h!==void 0){let k=await w.settleDreamItems({memoryDir:S,before:h,dreamWrote:_,mayHaveWritten:O});if((k.skipped||k.failed)&&X&&!C.signal.aborted&&!u&&await w.claimLockGiveBack(S))await KUt(D,s.toolUseContext.storageV5)}}U="completion",re(L,R);let T=s.toolUseContext.taskRegistry.get(L),me=Y(T)?T.filesTouched.length:0;if(Y(T)&&T.filesTouched.length>0)i?.({...xnr(T.filesTouched),verb:"Improved"}),await wzn(s.toolUseContext,{source:"dream",summary:`consolidated ${T.filesTouched.length} ${M(T.filesTouched.length,"memory file")}`,paths:T.filesTouched});t(`[autoDream] completed \u2014 cache: read=${A.totalUsage.cache_read_input_tokens} created=${A.totalUsage.cache_creation_input_tokens}`),a("tengu_auto_dream_completed",{cache_read:A.totalUsage.cache_read_input_tokens,cache_created:A.totalUsage.cache_creation_input_tokens,output:A.totalUsage.output_tokens,sessions_reviewed:p.length,files_touched_count:me,team_memory_enabled:F,account_memory_line_rendered:!1})}catch(l){if(C.signal.aborted){t("[autoDream] aborted by user");return}if(t(`[autoDream] ${U} failed: ${d(l)}`),a("tengu_auto_dream_failed",{phase:f(U),error_class:_W(N(l))}),U==="fork")oe(L,R),await KUt(D,s.toolUseContext.storageV5)}}}function ye(e,r){if(e.type!=="user"||e.toolDenialKind!==void 0||typeof e.message.content==="string")return;for(let o of e.message.content)if(o.type==="tool_result"&&o.is_error===!0)r.add(o.tool_use_id)}function _e(e,r,o){return(y)=>{if(y.type!=="assistant")return;let c="",s=0,i=[];for(let n of y.message.content)if(n.type==="text")c+=n.text;else if(n.type==="tool_use"){if(s++,n.name===at||n.name===Vt){let u=n.input;if(typeof u.file_path==="string")i.push(u.file_path)}else if(Xp.includes(n.name)){let u=n.input;if(typeof u.command==="string"&&pe.test(u.command))for(let E of u.command.matchAll(/"[^"]*\.md"|'[^']*\.md'|(?:\/|[A-Za-z]:[\\/])\S*\.md\b/g))i.push(E[0].replace(/^["']|["']$/g,""))}}te(e,{text:c.trim(),toolUseCount:s},i.filter((n)=>THe(n,o)),r)}}async function RFs(e,r){await B.of(e.toolUseContext.session.host).runner?.(e,r)}
export{ean,Kyt,CFs,RFs};
