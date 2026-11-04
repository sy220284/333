// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{oct}from"/$bunfs/root/chunk-hv5fsyce.js";import{Ze}from"/$bunfs/root/chunk-wxyh2ndv.js";var r=oct("computerUseMcpState",void 0);class Jyt{#e;constructor(e){this.#e=e}static over(e){return new Jyt(r(e.getState,e.setState))}get(){return this.#e.get()}update(e){this.#e.set(e)}}class t{owner=void 0;acquire(e){if(this.owner)return()=>{};return this.owner=e,()=>{if(this.owner===e)this.owner=void 0}}}var oUt=new Ze(()=>new t);function mUs(e){return oUt.of(e).owner}
export{Jyt,oUt,mUs};
