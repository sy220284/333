// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{IC}from"/$bunfs/root/chunk-wxyh2ndv.js";import{W}from"/$bunfs/root/chunk-agahg8zh.js";import{Sp}from"/$bunfs/root/chunk-yx0yvz1d.js";import{GRo,zRo}from"/$bunfs/root/chunk-qkb3gtj7.js";import{od}from"/$bunfs/root/chunk-9w39wpj0.js";class i{activePark=null}var s=new W(()=>new i);async function _ht(r,e,n,a){if(!Sp())return!1;let o=s.of(r),t=await GRo(e,n,a);switch(t.kind){case"refused":return!1;case"already":if(o.activePark?.needs!==e)d(o,e,{tempo:"idle",needs:void 0,detail:""},a);return!0;case"wrote":return d(o,e,t.prior,a),!0}}function d(r,e,n,a){r.activePark?.unsubscribe();let o=IC(()=>{if(Sp())return;let t=r.activePark;if(!t||t.needs!==e)return;r.activePark=null,t.unsubscribe(),zRo(e,t.prior,t.storageV5).catch(od)});r.activePark={needs:e,prior:n,storageV5:a,unsubscribe:o}}
export{_ht};
