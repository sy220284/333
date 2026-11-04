// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{yt}from"./chunk-2z63wn86.js";var s=null;function J6s(e){let n=s;return s=e,n}function p9n(){return s}var r=null;function Q6s(e){let n=r;return r=e,n}async function Dse(e){return await r?.(e)??!1}class CKe extends Error{consent;constructor(e){super("first-party design MCP server requires consent");this.consent=e;this.name="FirstPartyDesignNeedsConsentError"}}var t=null;function Z6s(e){let n=t;return t=e,n}function Dtt(){return t}function m9n(e){let n=yt();if(n.scopeExpansionDisclosed)return;n.scopeExpansionDisclosed=!0,n.pendingScopeExpansionNotice=e}function eBo(){let e=yt(),n=e.pendingScopeExpansionNotice;return e.pendingScopeExpansionNotice=void 0,n}function e3s(){let e=eBo();if(e)process.stderr.write(`${e}
`)}
export{J6s,p9n,Q6s,Dse,CKe,Z6s,Dtt,m9n,eBo,e3s};
