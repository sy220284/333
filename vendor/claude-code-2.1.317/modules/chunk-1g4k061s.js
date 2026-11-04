// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{Kt}from"./chunk-jfgvczh1.js";import{be}from"./chunk-mf6cjfte.js";import{gw,$xn,Y3}from"./chunk-h3te1a3j.js";function i(){return c(Y3($xn(),"globalConfig"),Kt("userSettings")?Y3(be("userSettings")?.env,"userSettings"):{},Y3(be("flagSettings")?.env,"flagSettings"),Y3(be("policySettings")?.env,"policySettings"))}function Zte(){return g(gw(),i())}function g(s,n){let r=new Set(Object.keys(n).map((e)=>e.toUpperCase())),t={...s};for(let e of Object.keys(t))if(!(e in n)&&r.has(e.toUpperCase()))delete t[e];return Object.assign(t,n)}function c(...s){let n=new Map;for(let t of s)for(let[e,o]of Object.entries(t))n.set(e.toUpperCase(),{key:e,value:o});let r={};for(let{key:t,value:e}of n.values())r[t]=e;return r}
export{Zte};
