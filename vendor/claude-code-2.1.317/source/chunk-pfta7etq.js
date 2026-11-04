// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{p}from"/$bunfs/root/chunk-c3q80g49.js";import{Xo}from"/$bunfs/root/chunk-b3wp3jfr.js";import{F,Cu}from"/$bunfs/root/chunk-e56bj9s5.js";var QZ=Xo({kind:"mcp_elicitation",payload:p(()=>Cu((t)=>typeof t==="object"&&t!==null&&("serverName"in t)&&("params"in t))),result:p(()=>Cu((t)=>typeof t==="object"&&t!==null)),default:{action:"cancel"},holdsTop:!0}),abe=Xo({kind:"mcp_elicitation_waiting",payload:p(()=>Cu((t)=>typeof t==="object"&&t!==null&&("serverName"in t)&&("params"in t))),result:p(()=>F(["dismiss","retry","cancel","cancelled"])),default:"cancelled"});function BUo(t){return t===QZ.kind||t===abe.kind}
export{QZ,abe,BUo};
