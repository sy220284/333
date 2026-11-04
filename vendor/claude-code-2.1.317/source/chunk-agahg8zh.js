// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
class W{#o;#r=new WeakMap;constructor(o){this.#o=o}of(o){let e=this.#r.get(o);if(e!==void 0)return e;let s=this.#o();return this.#r.set(o,s),s}}var r={isDiskless:()=>!1,isDisklessProcess:()=>!1,reportBuilt:()=>{}};function gWi(o){r=o}function Doe(){return r.isDiskless()}function hWi(){return r.isDisklessProcess()}var yWi=new W(()=>({}));var t="NoConfigHomeError";function hgt(o){try{return typeof o==="object"&&o!==null&&"name"in o&&o.name===t}catch{return!1}}
export{W,gWi,Doe,hWi,yWi,hgt};
