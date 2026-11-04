// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{U}from"./chunk-wxyh2ndv.js";import{W}from"./chunk-agahg8zh.js";import{l}from"./chunk-xkb87seb.js";var s=new W(()=>({alreadyReported:new Set}));function cK(r){try{let e=s.of(U().host);if(!e.alreadyReported.has(r))e.alreadyReported.add(r),e.listener?.(r)}catch(e){l(e)}}
export{cK};
