// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{gg,Nn}from"./chunk-nj8ddyrh.js";import{W4,Glt}from"./chunk-1w9e8s6h.js";import{wVe,Jv,nc,Ob,rR}from"./chunk-thp9mgjc.js";function d(e){return e!==void 0&&gg(e)?{kind:"unresolved",reason:"Its marketplace is a folder whose catalog could not be read, or lists it no more."}:{kind:"copy"}}async function v_o(e,o){let[r,l]=await Promise.all([rR(e,o),nc(o)]),n=l[Nn(e).marketplace??""]?.source;if(r===null)return d(n);let{source:t}=r.entry,c=wVe(t,n);if(typeof t!=="string"||!c)return{kind:"copy"};let i=Ob(r.marketplaceInstallLocation)===void 0?"workspace":"system",a=await W4(e,r.marketplaceInstallLocation,t,l,Jv(),o,i);return a.kind==="ok"?{kind:"folder",path:a.entryPath}:{kind:"unresolved",reason:Glt(a,r.marketplaceInstallLocation,t).message}}export{v_o};
