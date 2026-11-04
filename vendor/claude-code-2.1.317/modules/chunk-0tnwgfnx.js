// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{Ze,U}from"./chunk-wxyh2ndv.js";import{I,y,j}from"./chunk-3j5jca5v.js";j();var C0e="continue";function vYs(t,e,n){if(n&&e===C0e&&t===C0e+"/")return"/";if(e.startsWith("/")&&t.length===C0e.length+e.length+1&&t.startsWith(C0e+e))return t.slice(C0e.length);return t}class o{lastResult=null;listeners=new Set;inFlight=null}var l=new Ze(()=>new o);function i(){return l.of(U())}function YBr(t){let e=i();e.lastResult=t;for(let n of e.listeners)n(t)}function kYs(){return i().inFlight}function DNo(t){i().inFlight=t}function TYs(){YBr(null),i().inFlight=null}function AYs(){let[t,e]=y(()=>i().lastResult);return I(()=>{let n=i();return e(n.lastResult),n.listeners.add(e),()=>{n.listeners.delete(e)}},[]),t}
export{C0e,vYs,YBr,kYs,DNo,TYs,AYs};
