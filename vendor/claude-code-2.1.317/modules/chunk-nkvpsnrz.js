// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{at}from"./chunk-tm88cq46.js";import{l}from"./chunk-xkb87seb.js";import{Qt}from"./chunk-9yyeym00.js";var e="claudecode/editResult",u="1";function N_o(o,t){return o===at&&Qt(t)&&t[e]===u}async function $_o(o,t){if(o.isError===!0||t.subagentFrameResult===void 0)return o;try{if(await t.subagentFrameResultHolds?.()===!1)return o}catch(r){return l(r),o}return{...o,_meta:{...o._meta,[e]:t.subagentFrameResult}}}
export{N_o,$_o};
