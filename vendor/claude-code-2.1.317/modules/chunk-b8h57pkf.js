// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{ae}from"./chunk-pa6r6bee.js";import{$ee,B5r,O4o,jqe}from"./chunk-thp9mgjc.js";import{xa,zMe}from"./chunk-s2hz1q91.js";function que(){return jqe()||$ee(xa,zMe())}function tOo(){if(!que())return null;if(O4o()&&!$ee(xa,zMe()))return B5r;return"--chrome is blocked by your organization's MCP policy (an enterprise MCP config or a deniedMcpServers entry)."}function rVn(r){let{mode:e,isBypassPermissionsModeAvailable:o}=ae(r);return e==="bypassPermissions"||e==="plan"&&o}
export{que,tOo,rVn};
