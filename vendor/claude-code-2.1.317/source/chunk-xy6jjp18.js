// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{BV,doe}from"/$bunfs/root/chunk-tx0a2t4t.js";function s(r){return r!=null&&typeof r=="object"}var UV=s;var l=Array.isArray,JE=l;var y="[object Symbol]";function b(r){return typeof r=="symbol"||UV(r)&&doe(r)==y}var Cce=b;function u(r,t){var o=-1,i=r==null?0:r.length,n=Array(i);while(++o<i)n[o]=t(r[o],o,r);return n}var sJe=u;var a=1/0,e=BV?BV.prototype:void 0,f=e?e.toString:void 0;function m(r){if(typeof r=="string")return r;if(JE(r))return sJe(r,m)+"";if(Cce(r))return f?f.call(r):"";var t=r+"";return t=="0"&&1/r==-a?"-0":t}var p=m;function d(r){return r==null?"":p(r)}var Rce=d;
export{sJe,JE,UV,Cce,Rce};
