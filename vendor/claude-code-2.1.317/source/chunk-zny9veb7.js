// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
function Ozs(n){let e=new TextEncoder().encode(n);if(e.every((r)=>r>=32&&r<127&&r!==34&&r!==92))return n;return`"${Array.from(e,(r)=>{switch(r){case 34:return"\\\"";case 92:return"\\\\";case 9:return"\\t";case 10:return"\\n";case 13:return"\\r";default:return r>=32&&r<=126?String.fromCharCode(r):`\\${r.toString(8).padStart(3,"0")}`}}).join("")}"`}
export{Ozs};
