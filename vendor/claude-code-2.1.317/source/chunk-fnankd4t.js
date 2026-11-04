// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{Rn}from"/$bunfs/root/chunk-q0j77z7t.js";import{kM,kA,lE,$S}from"/$bunfs/root/chunk-jsa3axxf.js";import{je}from"/$bunfs/root/chunk-m2dj5b5f.js";import{Kg,Kmo}from"/$bunfs/root/chunk-1dza7qzz.js";import{cx}from"/$bunfs/root/chunk-dxgqqcc3.js";import{dirname as v,join as a}from"path";import{realpath as f}from"fs";import{promisify as m}from"util";var h=m(f.native);function c(e){return/^[A-Za-z0-9_-]{1,128}$/.test(e)?e:kM(e)||"empty-id"}async function d(e,t,{isRootResolved:n=!1}={}){return n?Rn(e):$S(e,cx(t))}async function Dzs(e,t,n,i){return a(lE(await d(e,n,i)),JNr(t))}async function Lzs(e,t,n,i){let o=await d(e,n,i),p=a(lE(o),JNr(t)),r=kA(o),s=n===void 0?void 0:MOo(r,t);return{path:p,projectKey:r,v5:n===void 0||s===void 0?void 0:{backend:n,key:s}}}function MOo(e,t){let n=je.dirSyncRecord(e,c(t));return Kg(n)===void 0?n:void 0}function JNr(e){return`${c(e)}${Kmo}`}
export{Dzs,Lzs,MOo,JNr};
