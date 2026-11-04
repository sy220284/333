// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
var mCe=10,gCe=2000;function hCe(m,n,t=Date.now){let e=m,o=t();function r(){let k=t(),u=Math.floor((k-o)/n);if(u>0)e=Math.min(m,e+u),o+=u*n}return{tryConsume(){if(r(),e>0)return e--,!0;return!1},tokens(){return r(),e},msUntilToken(){if(r(),e>0)return 0;return Math.max(0,o+n-t())}}}
export{mCe,gCe,hCe};
