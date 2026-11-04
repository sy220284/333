// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{P9,Jt}from"/$bunfs/root/chunk-ft5hc2h0.js";import{c}from"/$bunfs/root/chunk-5s4g6bgt.js";import{t}from"/$bunfs/root/chunk-qx8w2w8f.js";import{gT}from"/$bunfs/root/chunk-y1has5v0.js";function mxt(e){if(!P9(e))return!1;if(Jt(e))return!0;return/^[A-Za-z0-9][A-Za-z0-9_]*$/.test(e)&&gT(e)!==void 0}function ifr(e,o={}){return o.acceptCustomIds?P9(e):mxt(e)}function j5e(e,o,n={}){if(o)return{adoptedSessionId:null,effectiveFork:!0};if(e===void 0)return{adoptedSessionId:null,effectiveFork:!1};if(ifr(e,n))return{adoptedSessionId:e,effectiveFork:!1};return t(`resume: transcript session id (${typeof e}) rejected by the adoption gate; continuing as a fork under the fresh session id`),c("session_resume","unadoptable_session_id"),{adoptedSessionId:null,effectiveFork:!0}}
export{mxt,ifr,j5e};
