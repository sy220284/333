// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{Uu}from"./chunk-d01ffsyh.js";var e="self_hosted_runner_";function Tln(n){return n.startsWith(e)}function HKn(n){return Uu([...n]).some(Tln)}function fIo(n){return Uu([n]).filter((t)=>!Tln(t)).join(",")}function pIo(n){if(n===void 0)return!1;let t=typeof n==="string"?n:String(n);return Uu([t]).some(Tln)}function LWs(n){let t=n.tools;if(t===void 0)return n;let o=typeof t==="string"?t:String(t);if(!pIo(o))return typeof t==="string"?n:{...n,tools:o};return{...n,tools:fIo(o)}}
export{Tln,HKn,fIo,pIo,LWs};
