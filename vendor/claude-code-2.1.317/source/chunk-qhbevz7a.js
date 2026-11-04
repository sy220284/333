// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{Zf}from"/$bunfs/root/chunk-v1dhx02j.js";import{aTe}from"/$bunfs/root/chunk-svppe5z4.js";import{z_}from"/$bunfs/root/chunk-jdmxbspc.js";import{QMe}from"/$bunfs/root/chunk-sak81adv.js";import{homedir as i}from"os";import{dirname as l,join as e}from"path";var bUe=".credentials.json",SUe=".device-keys.json";function Bcr(){return e(i(),".claude",SUe).normalize("NFC")}var r6t=".config.json",Ats=`.claude${aTe[0]}.json`,gZr=aTe.map((o)=>`.claude${o}.json`),N_i=[...gZr,r6t,bUe,SUe];function MRt(){let o=Zf(),r=QMe();if(o===null||r===null)return[Bcr()];let t=l(z_());return[...gZr.map((n)=>e(t,n)),e(o,r6t),e(r,bUe),Bcr()]}
export{bUe,SUe,Bcr,r6t,Ats,gZr,N_i,MRt};
