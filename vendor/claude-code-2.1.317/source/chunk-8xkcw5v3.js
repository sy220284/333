// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{S6s}from"/$bunfs/root/chunk-d2pm2xe8.js";import{oki}from"/$bunfs/root/chunk-y0kzwxaj.js";function epn(a,n){let e=oki(a);if(e.outcome==="drop")return{verdict:"drop",cause:"schema_unsupported",reason:e.reason};if(e.outcome==="normalized"&&!n.normalizeEnabled)return{verdict:"drop",cause:"normalize_gated",reason:`its input schema uses top-level ${e.combinators.join("/")}, which the Anthropic API does not accept`};let o=e.outcome==="normalized"?{schema:e.schema,note:e.note,combinators:e.combinators}:void 0,i=S6s(o?.schema??a);if(i.valid)return{verdict:"send",normalized:o,apiWouldReject:void 0};if(!n.apiValidateEnabled)return{verdict:"send",normalized:o,apiWouldReject:i};return{verdict:"drop",cause:"api_invalid",normalized:o,rejection:i}}
export{epn};
