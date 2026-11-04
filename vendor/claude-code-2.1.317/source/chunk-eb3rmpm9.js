// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{yn}from"/$bunfs/root/chunk-bzrdrfgc.js";var _="Claude Preview",c="Claude Browser",E=yn(_),l=yn(c),u=new Set([E,l]);function rNe(e){return u.has(yn(e))}var hwt=["file_upload"],g9n="anthropic/hostAsksPerUploadedFile",d=new Set(["description","activeForm"]);function h9n(e,o,n,i){let t=`mcp__${yn(e)}__${o}`;return{async checkPermissions(){return{behavior:"ask",message:`${e} requires permission.`,suggestions:[{type:"addRules",rules:[{toolName:t,ruleContent:void 0}],behavior:"allow",destination:"session"}],metadata:{command:{name:t,chrome:{hostHandlesOriginConsent:!0}}}}},...n!==void 0&&Object.hasOwn(n,"code")&&{toAutoClassifierInput(r){let a=Object.keys(r).filter((s)=>!d.has(s));return i(Object.fromEntries(a.map((s)=>[s,r[s]])),o)}}}}
export{rNe,hwt,g9n,h9n};
