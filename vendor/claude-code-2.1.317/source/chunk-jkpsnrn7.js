// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
var ekn=/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}\u2800]|(?!\u0020)\p{Zs}/u;function OJr(n){return ekn.test(n)}var o=/\p{Cs}/u;function Ste(n){return OJr(n)||o.test(n)}function mit(n,t){return n.split(/\r?\n/).some(Ste)?`${t} is not shown here because it holds hidden or control characters`:n}function CU(n){return Ste(n)?"a path not shown here because it holds hidden or control characters":n}
export{ekn,OJr,Ste,mit,CU};
