// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{Or}from"./chunk-m2dj5b5f.js";import{C}from"./chunk-5x4vp4dg.js";import{wo}from"./chunk-9w39wpj0.js";import{cm,It}from"./chunk-rtjerv2s.js";import{X}from"./chunk-xv54wykd.js";import{mkdir as i}from"fs/promises";import{join as a}from"path";async function MBs(e,r){if(X()&&r!==void 0&&Or(e)){await n(r,{namespace:"job",jobId:e});return}await i(wo(e),{recursive:!0})}async function qze(e,r){if(X()&&r!==void 0&&Or(e)){await n(r,c(e));return}await i(a(wo(e),"tmp"),{recursive:!0})}function c(e){return{namespace:"job",jobId:e,relPath:["tmp"]}}async function n(e,r){let o=await e.ensureScope(r);if(!o.ok){let t=cm(o.error);throw Object.assign(new C(`job folder not made (${It(o.error)})`,"job folder not made"),t!==void 0?{code:t}:{})}}
export{MBs,qze};
