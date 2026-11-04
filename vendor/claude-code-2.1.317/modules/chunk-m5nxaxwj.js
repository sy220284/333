// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{G}from"./chunk-7dzj035f.js";import{zOi,tE,Wt}from"./chunk-yx0yvz1d.js";import{SP}from"./chunk-xr4hqtty.js";import{ec}from"./chunk-nycvw9v5.js";import{qyn,cqe}from"./chunk-thp9mgjc.js";import{I,J,Zy,j}from"./chunk-3j5jca5v.js";j();function t(){let[o,e]=Zy((s)=>s+1,0);return I(()=>zOi(e),[]),o}function QOr(o,e){return qyn(o)??qyn(e)??tE()}function aN(o){return Wt(QOr(o.mainLoopModelForSession,o.mainLoopModel))}function dAe(){let o=G((n)=>n.mainLoopModel),e=G((n)=>n.mainLoopModelForSession),s=SP(),i=t(),r=ec();return J(()=>cqe(e,o),[e,o,s,r,i])}function _Qe(){let o=G((n)=>n.mainLoopModel),e=G((n)=>n.mainLoopModelForSession),s=SP(),i=t(),r=ec();return J(()=>QOr(e,o),[e,o,s,r,i])}function Zc(){let o=G((n)=>n.mainLoopModel),e=G((n)=>n.mainLoopModelForSession),s=SP(),i=t(),r=ec();return J(()=>aN({mainLoopModel:o,mainLoopModelForSession:e}),[e,o,s,r,i])}
export{QOr,aN,dAe,_Qe,Zc};
