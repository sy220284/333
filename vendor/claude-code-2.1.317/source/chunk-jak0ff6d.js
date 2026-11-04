// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{M}from"/$bunfs/root/chunk-sctdt2my.js";import{nse}from"/$bunfs/root/chunk-zrdbree8.js";import{Et}from"/$bunfs/root/chunk-8mmyg6nh.js";import{en}from"/$bunfs/root/chunk-f999x1hg.js";var xGs=(t)=>`${t.path} (${en(t.bytes)})`;var nOo=(t,r)=>[t].filter((e)=>e>0).map((e)=>`and ${e} more ${M(e,r)} not named here`);var kNr=(t)=>(/^ */.exec(t)?.[0]??"")+Et(t,nse);var rOo=(t)=>[t].filter((r)=>r>0).map((r)=>`${r} ${M(r,"entry stays","entries stay")} on this machine (secrets, links, ignored files)`);var oOo=(t)=>[t??[]].flat().flatMap((r)=>[`Writes this manifest first, to ${r.path}:`,...r.text.trimEnd().split(`
`)]);var a=(t)=>`stays here: ${t.path} (${t.words})`;var sOo=(t)=>[...t.files.map(xGs),...nOo(t.unnamed?.files??0,"file"),...t.stays.map(a),...nOo(t.unnamed?.stays??0,"entry")].map(kNr);export{xGs,nOo,kNr,rOo,oOo,sOo};
