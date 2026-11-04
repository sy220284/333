// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
var ph=1e4;async function Ca(e,r,t){let s=Math.max(1,Math.floor(t?.maxPages??1e4)),u;for(let a=0;a<s;a++){if(t?.budget!==void 0){if(t.budget.pagesLeft<1)return{status:"capped"};t.budget.pagesLeft--}let n=await e(u);if(!n.ok)return{status:"error",error:n.error};if(await r(n.value.items),t?.until?.())return{status:"done"};if(u=n.value.cursor,!u)return{status:"done"}}return{status:"capped"}}function wAr(e=1e4){return{pagesLeft:e,capped:0}}function l1i(e,r){if(e.status==="error")return"error";if(e.status==="capped")return r.capped++,r.capped===1?"first-truncation":void 0;return}function d1i(e){return Math.max(0,e.capped-1)}
export{ph,Ca,wAr,l1i,d1i};
