// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{ye}from"/$bunfs/root/chunk-tgqpevk8.js";import{d2e,Pb}from"/$bunfs/root/chunk-2p0snphf.js";import{Ist}from"/$bunfs/root/chunk-2f0spw97.js";import{qn}from"/$bunfs/root/chunk-df4s59en.js";var PVn="\x1B]8;;",IVn="\x07";function Nw(e,r,t){let s=r===void 0?void 0:qn(r),n=s===void 0||EOo(e,s);if(!(n&&(t?.assumeSupport??!1)&&process.stdout.isTTY===!0&&(d2e()??!0)||(t?.supportsHyperlinks??Pb()))){let i=t?.shownUrlStart??"";if(r!==void 0&&!n)return`${r}${i} (${e})`;return`${i}${e}`}let o=(((t?.themeName)?Ist(t.themeName):!1)?ye.blue:ye.blueBright)(r??e);return`${PVn}${e}${IVn}${o}${PVn}${IVn}`}function EOo(e,r){return r===e||e===`http://${r}`||e===`https://${r}`}
export{PVn,IVn,Nw,EOo};
