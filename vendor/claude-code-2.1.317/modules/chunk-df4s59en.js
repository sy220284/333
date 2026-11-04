// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{eS}from"./chunk-sctdt2my.js";function qn(r){return Bun.stripANSI(r)}function mGe(r){return eS(qn(eS(String(r))))}function nl(r){return r.replace(/[^\n\r\v\f\x85\u2028\u2029]+/g,(n)=>qn(n))}
export{qn,mGe,nl};
