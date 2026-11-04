// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{o2}from"/$bunfs/root/chunk-mm2314jb.js";import{Se,R,bt,j}from"/$bunfs/root/chunk-3j5jca5v.js";j();var lDr=()=>a,a=()=>{},c=()=>{return};function Me(t,i){let n=Se(o2),r=R(null);if(r.current===null)r.current={select:i,last:null,source:null,get:c,notifier:n,subscribe:lDr};let e=r.current;if(e.select=i,e.source!==t||e.notifier!==n)e.notifier=n,e.subscribe=t?n?.paced(t.subscribe)??t.subscribe:lDr;if(e.source!==t)e.source=t,e.last=null,e.get=t?()=>{let s=t.getSnapshot(),o=e.select;if(!o)return s;let u=e.last;if(u!==null&&u.snapshot===s&&u.select===o)return u.selected;let l=o(s);return e.last={snapshot:s,select:o,selected:l},l}:c;return bt(e.subscribe,e.get,e.get)}
export{lDr,Me};
