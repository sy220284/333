// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
class tKe{#e=new Map;remember(i){for(let e of i)this.#e.delete(e.id),this.#e.set(e.id,e);for(let e of this.#e.keys()){if(this.#e.size<=512)break;this.#e.delete(e)}}get(i){return this.#e.get(i)}clear(){this.#e.clear()}}
export{tKe};
