// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{i}from"/$bunfs/root/chunk-jdmxbspc.js";import{homedir as s}from"os";import{join as o}from"path";function r(e){return{env:e?.env??process.env,home:e?.homedir??i.HOME??s()}}function ECi(e){let{env:n,home:t}=r(e);return n.XDG_STATE_HOME??o(t,".local","state")}function vCi(e){let{env:n,home:t}=r(e);return n.XDG_CACHE_HOME??o(t,".cache")}function a3e(e){let{env:n,home:t}=r(e);return n.XDG_DATA_HOME??o(t,".local","share")}function Uxn(e){return o(a3e(e),"claude","versions")}function A7(e){let{home:n}=r(e);return o(n,".local","bin")}
export{ECi,vCi,a3e,Uxn,A7};
