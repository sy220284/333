// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
function Jr(r){return r.map((t)=>{let n=String(t);if(n==="")return"''";if(/^[A-Za-z0-9_./:=@+,-]+$/.test(n))return n;return"'"+n.replaceAll("'",`'"'"'`)+"'"}).join(" ")}
export{Jr};
