// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{U}from"./chunk-wxyh2ndv.js";import{W}from"./chunk-agahg8zh.js";import{xY}from"./chunk-0nz48hvd.js";import{$u}from"./chunk-b70e80yc.js";var d=new W(()=>({degraded:!1}));function t(){return d.of(U().host)}function Dfe(n,r){if(n!==$u)return;let e=t();if(r===void 0){e.degraded=!1;return}let o=xY(r);if(o==="downstream_unreachable")e.degraded=!0;else if(o==="downstream_error")e.degraded=!1}function Q8s(){return t().degraded}
export{Dfe,Q8s};
