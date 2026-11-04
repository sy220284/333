// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{Lt}from"/$bunfs/root/chunk-qtd0ja5t.js";import{xMe}from"/$bunfs/root/chunk-aqhsn9c5.js";import{xV}from"/$bunfs/root/chunk-jp6k4gr0.js";var i=/^([a-z][a-z\d+\-.]*:)?\/\//i;function r(o,e){let s=e?.baseURL,n=i.test(o),t=null;if(n&&!xV(o))t=o;else if(s!=null&&!xV(s))t=s;else if(!n&&s==null)t=o;if(t!==null)throw Error(`downloads: request (url="${o}"`+(s!=null?`, baseURL="${s}"`:"")+") does not resolve to the public CDN (downloads.claude.ai). Use firstPartyApi for api.anthropic.com (residency-gated) or externalHttp for non-Anthropic hosts.")}var C3={get(o,e){return r(o,e),xMe(),Lt.get(o,e)}};
export{C3};
