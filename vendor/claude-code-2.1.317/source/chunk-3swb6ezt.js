// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{nf}from"/$bunfs/root/chunk-0956kcdv.js";import{Re}from"/$bunfs/root/chunk-354zpx9e.js";function EBe(o){let t=Re().loadedModules.find((s)=>s.name===o);return t===void 0||nf(t)}function Cas(){let o=new Map,t=new Map,s=new Set;return{list:(e)=>EBe(e)?[...o.get(e)?.values()??[]]:[],own:(e)=>{let r=o.get(e)??new Map;return o.set(e,r),r},serverKey:(e)=>t.get(e),ownerOfKey:(e)=>[...t.entries()].find(([,r])=>r===e)?.[0],keyed:(e,r)=>{t.set(e,r),s.add(r)},minted:(e)=>s.has(e),forget:(e)=>{o.delete(e),t.delete(e)}}}var e0=Cas();export{EBe,Cas,e0};
