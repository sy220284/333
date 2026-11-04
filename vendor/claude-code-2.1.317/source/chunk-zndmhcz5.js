// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{i}from"/$bunfs/root/chunk-jdmxbspc.js";import{ge}from"/$bunfs/root/chunk-s25vas16.js";var n=ge({scale:void 0},(e)=>{e.scale=void 0});function Udt(){let e=i.CLAUDE_CODE_JIT_POLICY_AFTER_STARTUP??1;if(typeof Bun<"u"&&typeof Bun.unsafe.setJITPolicy==="function")Bun.unsafe.setJITPolicy(e),n.scale=e;return e}function wcs(){return n.scale}
export{Udt,wcs};
