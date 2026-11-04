// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{WQ,c}from"/$bunfs/root/chunk-5s4g6bgt.js";import{t}from"/$bunfs/root/chunk-qx8w2w8f.js";import{M}from"/$bunfs/root/chunk-sctdt2my.js";import{$l}from"/$bunfs/root/chunk-mmesch9q.js";var d5t=(o)=>o.mcpInfo?.effectiveMaxPermission==="ask"?{ceiling:"ask"}:{};var xG=(o)=>({tool:o.name,ceiling:d5t(o).ceiling});function Lit(o){return o.hook.type==="callback"&&o.hook.internal===!0}function ghi(o,n){if($l()){let r=o.filter(Lit),e=o.length-r.length;if(e>0)t(`Hooks: ${e} ${n} ${M(e,"hook")} from settings or plugins not run: claude mcp serve --transport http never runs them (intended)`,{level:"warn"}),c(WQ(n),"not_run_in_tool_server_daemon",{num_dropped:e});return r}return o}
export{d5t,xG,Lit,ghi};
