// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
var fXe=String.raw`\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-[^}]*)?\}`;function Fre(e){return new RegExp(fXe).test(e)}function pXe(e){let n=[],r=0;for(let t of e.matchAll(new RegExp(fXe,"g")))n.push(e.slice(r,t.index)),r=t.index+t[0].length;return n.push(e.slice(r)),n}function WZt(e){return e.replace(new RegExp(fXe,"g"),(n)=>"x".repeat(n.length))}function mWe(e){return e.replace(new RegExp(fXe,"g"),(n,r)=>`\${${r}}`)}
export{fXe,Fre,pXe,WZt,mWe};
