// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
function r(n){return n}function b(n){return r(n)}function f(n){return r(n)}function de(n){return n==null?void 0:r(n)}function ro(n){return r(String(n))}function C5(n){return n==null?void 0:r(String(n))}function Uf(...n){return r(n.join(""))}function PRr(n){return r(n.join(","))}function Ea(n){return r([...n].sort().join(","))}function Mw(n,e){return r(n.join(e??","))}function Wn(n){return r(n)}function tv(n,e){return e?Wn(n):void 0}function lOs(n,e){return n!==void 0&&e.includes(n)&&/^[a-z0-9-]{1,64}$/.test(n)?Wn(n):b("none")}function Hoe(n,e){return e?Wn(n):b("custom")}function Xye(n){return Hoe(n.agentType,n.source==="built-in")}function o_o(n,e){return e?Wn(n):b("third-party")}
export{b,f,de,ro,C5,Uf,PRr,Ea,Mw,Wn,tv,lOs,Hoe,Xye,o_o};
