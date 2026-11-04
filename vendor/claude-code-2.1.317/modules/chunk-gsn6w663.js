// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{w}from"./chunk-fdshth00.js";import{n}from"./chunk-26xg87f0.js";import{r}from"./chunk-map0z771.js";function WS(b){let R=w(7),{children:t,color:o,textColor:x,padded:T,bold:d,wrap:l}=b,e=T?" ":"";const p=x??(o?"inverseText":void 0);let s;if(R[0]!==d||R[1]!==t||R[2]!==o||R[3]!==e||R[4]!==p||R[5]!==l)s=r(n,{backgroundColor:o,color:p,bold:d,wrap:l,children:[e,t,e]}),R[0]=d,R[1]=t,R[2]=o,R[3]=e,R[4]=p,R[5]=l,R[6]=s;else s=R[6];return s}
export{WS};
