// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{fRt}from"/$bunfs/root/chunk-9wrebqzb.js";class smn extends TransformStream{constructor({onError:t,onRetry:a,onComment:o}={}){let s;super({start(e){s=fRt({onEvent:(r)=>{e.enqueue(r)},onError(r){t==="terminate"?e.error(r):typeof t=="function"&&t(r)},onRetry:a,onComment:o})},transform(e){s.feed(e)}})}}
export{smn};
