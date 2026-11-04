// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{Rs,Jx}from"./chunk-9z9d97rw.js";import{Jf}from"./chunk-bjevk2dr.js";import{Ln}from"./chunk-74x0zd10.js";import{M0e}from"./chunk-rtzcqnbm.js";import{Jlr}from"./chunk-w7fnvq05.js";class r{reader=void 0;register(e){this.reader=e}read(){return this.reader?.()??!1}}var o=new r;function D$o(e){o.register(e)}function Xet(){let e=Jx("allow_plugin_skill_search");if(e==="org_denied"||e==="latched"||e==="unregistered"||e!==null&&Rs("hipaa"))return!1;if(M0e())return!0;return Jf()&&Ln()&&o.read()}function d9i(e){if(!Jlr.includes(e))return!0;return Xet()}
export{D$o,Xet,d9i};
