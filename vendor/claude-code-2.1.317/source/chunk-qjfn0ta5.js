// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
var B9=8;function XOr(o,u){let e=[],t="",n=0;for(let r of o){let s=c(r);if(n+s>u&&t!=="")e.push(t),t="",n=0;t+=r,n+=s}return e.push(t),e}function c(o){return o.length===1&&o<"\x80"?1:2}
export{B9,XOr};
