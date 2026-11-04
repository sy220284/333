// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
var o=new RegExp("^(?:settings|(?:plugin|skill)(?::[A-Za-z0-9][A-Za-z0-9._-]{0,63})?)$"),t=new RegExp("^[A-Za-z0-9][A-Za-z0-9._-]{0,63}@[A-Za-z0-9][A-Za-z0-9._-]{0,63}$");function R2n(n){return typeof n==="string"&&o.test(n)?n:void 0}function x2n(n){return typeof n==="string"&&t.test(n)?n:void 0}function R1s(n,e){if(n===`PreToolUse:${e}`)return"PreToolUse";return n==="tool.check"?"tool.check":void 0}function x1s(n){return n==="PreToolUse"||n==="tool.check"?n:void 0}
export{R2n,x2n,R1s,x1s};
