// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{Ae}from"./chunk-h16yd173.js";import{_,te}from"./chunk-qx8w2w8f.js";import{oTo}from"./chunk-jfbvz966.js";import{Dr}from"./chunk-vsn19725.js";import{w}from"./chunk-fdshth00.js";import{n,Ts}from"./chunk-26xg87f0.js";import{Ke}from"./chunk-b6pbvb3h.js";import{$5}from"./chunk-syw4da9n.js";import{e}from"./chunk-map0z771.js";import{Nw}from"./chunk-e1yskt15.js";import{v6o}from"./chunk-9c8381st.js";import{Yt,Se,J,j}from"./chunk-3j5jca5v.js";j();j();j();var l=Yt(!1);function hOr(t){let s=w(2),{children:r}=t,o;if(s[0]!==r)o=e(l.Provider,{value:!0,children:r}),s[0]=r,s[1]=o;else o=s[1];return o}function u(){return Se(l)}function E(t){try{let r=te(t),s=_(r),o=t.replaceAll("\\/","/").replace(/\s+/g,""),m=s.replace(/\s+/g,"");if(o!==m)return t;return _(r,null,2)}catch{return t}}var M=1e4;function x(t){if(t.length>M)return t;return t.split(`
`).map(E).join(`
`)}var P=/https?:\/\/[^\s"'<>\\\x00-\x1f]+/g,A=1e5;function yOr(t,r){if(t.length>A)return t;let s=(o)=>o.replace(P,(m)=>Nw(m,void 0,{themeName:r}));if(!t.includes(oTo))return s(t);return t.split(`
`).map((o)=>o.includes(oTo)?o:s(o)).join(`
`)}function jM(t){let c=w(14),{content:r,verbose:s,isError:o}=t,{columns:m}=Ae(),[d]=Dr(),k=u(),g=Se($5),z=s||k,F;if(c[0]!==r||c[1]!==d)F=yOr(x(r),d),c[0]=r,c[1]=d,c[2]=F;else F=c[2];let a=F,h;ct:{if(z){let i;if(c[3]!==a)i=f(a),c[3]=a,c[4]=i;else i=c[4];h=i;break ct}let i;if(c[5]!==m||c[6]!==a||c[7]!==g)i=f(v6o(a,m,g)),c[5]=m,c[6]=a,c[7]=g,c[8]=i;else i=c[8];h=i}let N=h,R=o?"error":void 0,i;if(c[9]!==N)i=e(Ts,{children:N}),c[9]=N,c[10]=i;else i=c[10];let O;if(c[11]!==R||c[12]!==i)O=e(Ke,{children:e(n,{color:R,children:i})}),c[11]=R,c[12]=i,c[13]=O;else O=c[13];return O}function f(t){return t.replace(/\u001b\[([0-9]+;)*4(;[0-9]+)*m|\u001b\[4(;[0-9]+)*m|\u001b\[([0-9]+;)*4m/g,"")}
export{hOr,yOr,jM};
