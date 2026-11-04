// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{t}from"./chunk-qx8w2w8f.js";function hN(r,n,o){let e=n.safeParse(o);if(e.success)return e.data;let s=e.error.issues[0];return t(`[thin-client] ${r} reply did not match its schema (${e.error.issues.length} issue(s); first: ${s?`${s.path.join(".")||"<root>"}: ${s.message}`:"unknown"})`,{level:"warn"}),null}
export{hN};
