// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{p}from"./chunk-c3q80g49.js";import{gLo,w4n}from"./chunk-wz6fq8bz.js";import{_we,kci}from"./chunk-ttn3wae7.js";import{o,oe,A,u,T}from"./chunk-e56bj9s5.js";var n=1,a=64,s="offer",t=p(()=>o().regex(_we).refine(kci)),c=p(()=>u({v:T(n),head:t(),branch:o().min(1).max(gLo).refine(w4n),ancestors:A(oe()).max(a).pipe(A(t()))}));function pHs(e){let r=c().safeParse(e[s]);return r.success?r.data:null}
export{pHs};
