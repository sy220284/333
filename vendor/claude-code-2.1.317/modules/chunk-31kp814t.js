// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{U,ui,Ru}from"./chunk-wxyh2ndv.js";import{W}from"./chunk-agahg8zh.js";import{le}from"./chunk-qx8w2w8f.js";import{L}from"./chunk-kj64tv5d.js";class i{directories=[];announced=new Set;get(){return this.directories}publish(o){let t=L([...o.additionalWorkingDirectories.values()].map((e)=>e.path)).sort(),n=this.directories;if(n.length===t.length&&n.every((e,s)=>e===t[s]))return!1;return this.directories=t,!0}noteAnnounced(o){for(let t of o)this.announced.add(t)}everAnnounced(){return[...this.announced]}reset(){this.directories=[],this.announced.clear()}}var d=new W(()=>new i);function r(){return d.of(U().host)}function Ose(){let o=r(),t=ui(),n=Ru();return o.noteAnnounced([...t===null?[]:[t],...n===null?[]:[n],...c(),...o.get()]),o.get()}function R6s(){return r().everAnnounced()}function b8n(o){return r().publish(o)}function c(){try{return[le().cwd()]}catch{return[]}}
export{Ose,R6s,b8n};
