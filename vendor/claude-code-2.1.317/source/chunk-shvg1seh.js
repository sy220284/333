// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{Ao}from"/$bunfs/root/chunk-wxyh2ndv.js";import{m,c}from"/$bunfs/root/chunk-5s4g6bgt.js";import{Dl}from"/$bunfs/root/chunk-y52m2tkd.js";import{HTe}from"/$bunfs/root/chunk-zv0j9srt.js";import{sbo}from"/$bunfs/root/chunk-9d7j1pvj.js";var Qye="repo_rules_unread";function f5i(e,o){let t=HTe(e,o.meta);return t instanceof Promise?t.then((r)=>s(r,o)):s(t,o)}function s(e,o){if(e.refused!==void 0)return(e.refused.cause==="repo_rules_read_failed"?m:c)("mcp_serve_file_call",e.refused.cause),Qye;return e.repoRules===void 0?o.launchPermissionContext:n(o.launchPermissionContext,e.repoRules,o)}function n(e,o,{session:t}){let r=e??Dl();return{...r,...sbo({alwaysDenyRules:{},alwaysAskRules:{}},r,Ao(t).originalCwd,o,"upload")}}
export{Qye,f5i};
