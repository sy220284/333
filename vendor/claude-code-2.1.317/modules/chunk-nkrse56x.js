// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{Ze}from"./chunk-wxyh2ndv.js";import{cPt}from"./chunk-y52m2tkd.js";var t=new Ze(()=>({byToolUse:new Map}));function GFo(n,e,i){t.of(n).byToolUse.set(e,i),cPt(n,e,()=>{Y6n(n,e)})}function Y6n(n,e){t.peek(n)?.byToolUse.delete(e)}function x9i(n,e){return e!==void 0&&t.peek(n)?.byToolUse.has(e)===!0}function zFo(n,e){if(e===void 0)return;let i=t.peek(n)?.byToolUse.get(e);return Y6n(n,e),i}
export{GFo,Y6n,x9i,zFo};
