// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{w}from"/$bunfs/root/chunk-fdshth00.js";import{tt,s,sl}from"/$bunfs/root/chunk-26xg87f0.js";import{pAe}from"/$bunfs/root/chunk-82epdtv4.js";import{jf}from"/$bunfs/root/chunk-57b8jx2s.js";import{e}from"/$bunfs/root/chunk-map0z771.js";var t=150;function eFt(M){let p=w(8),{tone:n,text:i}=M,T=jf(),N=tt(),o=T||N,[c,P]=sl(o?null:t);const f=Math.floor(P/t);let r;if(p[0]!==o||p[1]!==f||p[2]!==i||p[3]!==n)r=e(pAe,{state:"live",tone:n,text:i,linkify:!1,frame:f,reducedMotion:o}),p[0]=o,p[1]=f,p[2]=i,p[3]=n,p[4]=r;else r=p[4];let m;if(p[5]!==c||p[6]!==r)m=e(s,{ref:c,flexDirection:"column",children:r}),p[5]=c,p[6]=r,p[7]=m;else m=p[7];return m}var fAe=0;
export{eFt,fAe};
