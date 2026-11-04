// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{U}from"./chunk-wxyh2ndv.js";import{Q}from"./chunk-k4p8c4ay.js";import{W}from"./chunk-agahg8zh.js";import{Lve}from"./chunk-yx0yvz1d.js";class r{stampMs=0;detachedSinceLastAttach=!1;reset(){this.stampMs=0,this.detachedSinceLastAttach=!1}}var s=new W(()=>new r);function a(){return s.of(U().host)}function YRo(e){let t=a();if(e===0){t.reset();return}if(t.detachedSinceLastAttach||t.stampMs===0)t.stampMs=e;t.detachedSinceLastAttach=!1}function Nan(){a().detachedSinceLastAttach=!0}function XRo(){return a().detachedSinceLastAttach}function wZe(){return a().stampMs}function $an(e){return!1}async function H2n(){for(;;){let e=Date.now();if(!$an(e))return;let{detachedSinceLastAttach:t,stampMs:o}=a(),c=t||o===0?500:o+500-e;await Q(Math.max(25,c)+25)}}
export{YRo,Nan,XRo,wZe,$an,H2n};
