// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{f}from"./chunk-hd335g9m.js";import{a,ci}from"./chunk-sqwfq8wd.js";import{fM,Jx}from"./chunk-9z9d97rw.js";import{Ode}from"./chunk-w3pk16qp.js";var n="tengu_org_policy_denied";function r(i,o){let e=Jx(i);if(e===null||e==="unregistered")return null;return{org_policy_key:f(i),org_policy_deny_kind:f(e),org_policy_taint_named:Ode(fM()).length>0,surface:f(o)}}function oI(i,o){let e=r(i,o);if(e)a(n,e)}async function V1(i,o){let e=r(i,o);if(e)await ci(n,e)}
export{oI,V1};
