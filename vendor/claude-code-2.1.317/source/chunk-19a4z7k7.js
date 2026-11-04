// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{K,Dho,fW,Aoe}from"/$bunfs/root/chunk-wxyh2ndv.js";import{pRr}from"/$bunfs/root/chunk-q0j77z7t.js";import{Fe}from"/$bunfs/root/chunk-v1dhx02j.js";import{ACn}from"/$bunfs/root/chunk-z227w65w.js";import{createHash as s}from"crypto";import{join as i}from"path";function Kk(){return fW()??i(Aoe()??sRt(),K())}function sRt(){return i(Fe(),"uploads")}function Cae(){return[sRt(),Aoe()??ACn()]}function CTn(t,e){return`${t}-${u(e)}`}function AQr(t){return s("sha256").update(t.toLowerCase()).digest("hex").slice(0,8)}var a=/^[A-Za-z0-9_-]{8}-/;function o(t){return pRr(t.replace(/_+$/,""))}function u(t){return o(t)?t+"_":t}function Byi(t){let e=t.replace(a,"");if(e.endsWith("_")&&o(e))return e.slice(0,-1);return e||t}var c=1024;function jyi(t,e){let n=Dho();if(!n.has(t)&&n.size>=c){let r=n.keys().next().value;if(r!==void 0)n.delete(r)}n.set(t,e)}function eat(t){return Dho().get(t)}
export{Kk,sRt,Cae,CTn,AQr,Byi,jyi,eat};
