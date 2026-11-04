// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{Ao}from"./chunk-wxyh2ndv.js";import{g,m}from"./chunk-5s4g6bgt.js";import{E$n}from"./chunk-qx8w2w8f.js";import{G2}from"./chunk-v2qvnjaq.js";import{nN}from"./chunk-qjw8kvj6.js";function h5i(e,r){let{shell:t}=nN.of(r),{cwd:i,originalCwd:o}=Ao(r);if(!t.isWatched)t.isWatched=!0,t.hasMoved=i!==o,r.subscribe(()=>{if(t.hasMoved||=r.project?.cwd!==o,r.project?.cwd!==t.taken)t.taken=void 0});if(e===void 0||e===i||t.hasMoved)return;if(typeof e!=="string"||!E$n(e)){m("mcp_serve_shell_directory_held","not_a_plain_directory");return}if(!e.startsWith(`${o}/`)){m("mcp_serve_shell_directory_held","outside_launch_directory");return}t.taken=e,r.setCwd(e),G2(),g("mcp_serve_shell_directory_held")}function exr(e,r){return nN.peek(e)?.shell.taken===r}
export{h5i,exr};
