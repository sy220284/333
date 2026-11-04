// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{Ze}from"./chunk-wxyh2ndv.js";class s{#t=new Map;#n=0;onCleared=null;notePost(t){this.#t.set(t,(this.#t.get(t)??0)+1),this.#n++}forgetPost(t){let n=this.#t.get(t)??0;if(n<=1)this.#t.delete(t);else this.#t.set(t,n-1);this.#n=Math.max(0,this.#n-1)}atBound(t,n){return this.postsSinceHumanTurn(t)>=n.maxSelfHops||this.#n>=n.maxChainLength}seed(t,n){this.#t.clear();for(let[e,o]of t)this.#t.set(e,o);this.#n=n}noteHumanTurn(){let t=this.#n>0;if(this.#t.clear(),this.#n=0,t)this.onCleared?.()}peersPostedTo(){return[...this.#t.keys()]}postsSinceHumanTurn(t){return this.#t.get(t)??0}totalPostsSinceHumanTurn(){return this.#n}}var r=new Ze(()=>new s);
