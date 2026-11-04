// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{st}from"/$bunfs/root/chunk-enft32gw.js";import{_}from"/$bunfs/root/chunk-qx8w2w8f.js";import{p}from"/$bunfs/root/chunk-c3q80g49.js";import{ic,O,u,F,T}from"/$bunfs/root/chunk-e56bj9s5.js";var t=1,f=65536,r=p(()=>ic().min(0).default(0)),m=p(()=>u({version:ic()})),n=p(()=>u({version:T(t),generation:ic().min(1),appliedBeforeFirstAsk:O(),outcome:F(["applied","partial"]),filesApplied:r(),filesRefused:r(),settingsWritten:O().default(!1),replacedForeign:r(),writtenAtMs:ic().min(0)}));function r$o(o){let e=n().safeParse({...o,version:t});if(!e.success)throw Error("home ready row is off-schema");return Buffer.from(_(e.data))}function Z5n(o){if(o.length>f)return{ok:!1,reason:"oversize"};let e=st(o.toString("utf8"),!1),s=m().safeParse(e);if(s.success&&s.data.version!==t)return{ok:!1,reason:"unsupported_version"};let a=n().safeParse(e);if(!a.success)return{ok:!1,reason:"malformed"};let{version:l,...i}=a.data;return{ok:!0,ready:i}}
export{r$o,Z5n};
