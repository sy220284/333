// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
var r=null;function V5s(e){r=e}async function q5s(){if(r===null)return;let e=await r();return Array.isArray(e)?e.filter((n)=>typeof n?.tabId==="number"&&typeof n?.url==="string"):void 0}
export{V5s,q5s};
