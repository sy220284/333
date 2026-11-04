// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{w}from"/$bunfs/root/chunk-fdshth00.js";import{JZt,ice}from"/$bunfs/root/chunk-dk152bb6.js";import{n,tn}from"/$bunfs/root/chunk-26xg87f0.js";import{e}from"/$bunfs/root/chunk-map0z771.js";function fq(H){let y=w(10),{children:r,color:u,bold:m,linkHref:a}=H,o;if(y[0]!==r||y[1]!==a){o=[];let l=0;for(const i of r.matchAll(JZt)){let x=ice(i[0]);let k=a===void 0?x:a(x);if(k===void 0){continue}if(i.index>l)o.push(r.slice(l,i.index));o.push(e(tn,{url:k,children:k},i.index)),l=i.index+x.length}let s;if(y[3]!==r||y[4]!==l)s=r.slice(l),y[3]=r,y[4]=l,y[5]=s;else s=y[5];o.push(s);y[0]=r,y[1]=a,y[2]=o}else o=y[2];let s;if(y[6]!==m||y[7]!==u||y[8]!==o)s=e(n,{color:u,bold:m,children:o}),y[6]=m,y[7]=u,y[8]=o,y[9]=s;else s=y[9];return s}
export{fq};
