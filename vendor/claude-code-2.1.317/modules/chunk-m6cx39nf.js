// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{Mn}from"./chunk-qx8w2w8f.js";import{lye}from"./chunk-nj8ddyrh.js";function k_o(t,n){let e=Mn(t),r=n.map(Mn).sort(),s=lye(e,r.map((d)=>({name:d})),{maxEditDistance:2});if(s)return`No MCP server named "${e}". Did you mean "${s}"? Run \`claude mcp list\` to see all.`;if(r.length===0)return`No MCP server named "${e}". Run \`claude mcp add\` to add one.`;let o=8,a=r.slice(0,o).join(", "),i=r.length>o?` (and ${r.length-o} more \u2014 run \`claude mcp list\` to see all)`:"";return`No MCP server named "${e}". Configured servers: ${a}${i}`}function wUn(t,n,e){if(e&&n.length===0)return`No MCP server named "${Mn(t)}". ${".mcp.json servers are awaiting approval \u2014 run `claude` in this directory to review them."}`;return k_o(t,n)+(e?` (${".mcp.json servers are awaiting approval \u2014 run `claude` in this directory to review them."})`:"")}
export{k_o,wUn};
