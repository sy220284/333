// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{Oe}from"/$bunfs/root/chunk-y9ysdmh2.js";import{Ze}from"/$bunfs/root/chunk-wxyh2ndv.js";class e{#e={credentialsPersisted:0,loginCompleted:0};#t=Oe();subscribe=(t)=>this.#t.subscribe(t);getSnapshot=()=>this.#e;credentialsPersisted(){this.#e={...this.#e,credentialsPersisted:this.#e.credentialsPersisted+1},this.#t.emit()}loginCompleted(){this.#e={...this.#e,loginCompleted:this.#e.loginCompleted+1},this.#t.emit()}}var c2=new Ze(()=>new e);
export{c2};
