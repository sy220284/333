// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{Jco}from"./chunk-r6v32v6p.js";import{Mfo,RZt}from"./chunk-nj8ddyrh.js";var{ceil:i,max:a}=Math;function m(t,e,r){if(r?Mfo(t,e,r):e===void 0)e=1;else e=a(Jco(e),0);var n=t==null?0:t.length;if(!n||e<1)return[];var l=0,f=0,o=Array(i(n/e));while(l<n)o[f++]=RZt(t,l,l+=e);return o}var tEt=m;
export{tEt};
