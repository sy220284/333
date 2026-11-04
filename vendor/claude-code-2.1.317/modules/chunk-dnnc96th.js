// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{cb,v}from"./chunk-yx0yvz1d.js";import{kV}from"./chunk-8yj6zwg4.js";import{YAe}from"./chunk-eaxx2kx8.js";import{al}from"./chunk-thp9mgjc.js";function VKn(e,r,n,s,i){return s||cb(n)||e.suppressesAlwaysAllowRule?.(r,!v("tengu_valiant_crayon",!1))===!0&&!(i??[]).some((o)=>(o.type==="addRules"||o.type==="replaceRules")&&o.behavior==="allow"&&o.rules.some((t)=>t.ruleContent!==void 0))||void 0}function CBt(e,r,n){if(al(e.decisionReason,kV)!==void 0||YAe(n))return!0;if(r.requiresUserInteraction?.())return!0;return e.forcedByCaller===!0||e.personOnly===!0}
export{VKn,CBt};
