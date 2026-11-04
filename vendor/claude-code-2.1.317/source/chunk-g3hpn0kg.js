// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{kh,j}from"/$bunfs/root/chunk-3j5jca5v.js";j();function vP(r){if(typeof r==="string")return r;if(typeof r==="number")return String(r);if(!r)return"";if(Array.isArray(r))return r.map(vP).join("");if(kh(r))return vP(r.props.children);return""}
export{vP};
