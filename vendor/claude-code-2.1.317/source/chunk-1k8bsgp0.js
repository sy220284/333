// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{VO}from"/$bunfs/root/chunk-zzy8kns8.js";var Kf=Symbol("untrustedArray.unreadable"),K3="<unreadable list>";function vS(e){let n;try{if(!Array.isArray(e))return;n=e.length}catch{return Kf}if(typeof n!=="number"||!Number.isSafeInteger(n)||n<0||n>VO)return Kf;let u=[];for(let r=0;r<n;r++){let t;try{t=e[r]}catch{t=void 0}u.push(t)}return u}function kle(e){let n=vS(e);return n===Kf?void 0:n}
export{Kf,K3,vS,kle};
