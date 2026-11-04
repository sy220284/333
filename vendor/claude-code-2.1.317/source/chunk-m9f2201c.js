// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{posix as o}from"path";var Tse=".ccr-seed",L5s=501,zjt=o.join(Tse,"manifest.json"),S=o.join(Tse,"ready.json"),T=o.join(Tse,"laptop.json"),x=o.join(Tse,"worker.json"),Ase=o.join(Tse,"home","pack.json"),ISt=o.join(Tse,"home","ready.json");var f=o.join(Tse,"overlay.bundle"),s=256,i=500,_=4,c=2,l=1,r=_+c+l,e=200,E=2,A=Math.min(e,i-r-E-e),L=s-r,H5s=400;function ott(n){let t=o.join("/",n.replaceAll("\\","/"));return t===`/${Tse}`||t.startsWith(`/${Tse}/`)}function Rfn(n){return!n.split("/").some((t)=>t===""||t==="."||t==="..")}var R=/^\.\.namedfork$/i;function N5s(n){return n.split("/").some((t)=>R.test(t))}
export{Tse,L5s,zjt,Ase,ISt,H5s,ott,Rfn,N5s};
