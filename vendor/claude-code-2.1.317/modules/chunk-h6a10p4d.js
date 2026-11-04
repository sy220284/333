// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{p}from"./chunk-c3q80g49.js";import{NKe}from"./chunk-97fj9z9n.js";import{o,A,He}from"./chunk-e56bj9s5.js";import{Ze}from"./chunk-wxyh2ndv.js";var P3n=new Ze(()=>({}));function I3n(n,r){let e=n?.servers.get(r.name);return e!==void 0&&r.config.type==="http"&&r.config.url===e.url&&n?.heldSinceBoot(r.name)===!0?e.server:void 0}var t=p(()=>o().regex(/^[A-Za-z_][A-Za-z0-9_]{0,31}$/).refine((n)=>!(n in Object.prototype))),i=p(()=>A(He({arg:t(),local:t(),ref:t()})).length(1));function O3n(n){let r=i().safeParse(n?.[NKe]);if(!r.success)return;let[e]=r.data;return e!==void 0&&e.local!==e.ref?e:void 0}
export{P3n,I3n,O3n};
