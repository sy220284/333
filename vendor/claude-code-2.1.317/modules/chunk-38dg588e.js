// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{t}from"./chunk-qx8w2w8f.js";import{Zl}from"./chunk-sctdt2my.js";import{Ut}from"./chunk-yx0yvz1d.js";import{SSt}from"./chunk-w0p3hgf9.js";function bBs(){return!Ut()}function a_t(o){return o.filter((r)=>!r.mcpErrorMetadata&&!r.statusOnly&&!r.startupFatal)}function l_t(o){let r=[],i=[];for(let n of o)(n.statusOnly?r:i).push(n);return{statusNotices:r,invalidEntries:i}}function d_t(o){for(let r of o)t(`Invalid setting skipped without dialog (automated session): ${Zl(SSt(r.file))}: ${r.path}: ${r.message}`,{level:"error"})}
export{bBs,a_t,l_t,d_t};
