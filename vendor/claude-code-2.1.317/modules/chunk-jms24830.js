// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{MPt}from"./chunk-hq6a4gxw.js";import{randomBytes as o}from"crypto";import{hostname as s}from"os";var i=/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/,a=/^[A-Za-z]{1,64}$/,c=/^([A-Za-z0-9][A-Za-z0-9._-]{0,63})\/([A-Za-z]{1,64})\/(\d{1,4})$/,m=8,I=64,d=9999,r={hostname:s,randomHex:(n)=>o(n).toString("hex")};function ZHs(n=r){return`dev-${n.randomHex(m)}`}function _$t(n=r){let[t=""]=n.hostname().split(".");return MPt(t,I)}function e0s(n,t,e){if(!i.test(n)||!a.test(t)||!Number.isInteger(e)||e<0||e>d)throw Error("cannot form a device hook id from these inputs");return`${n}/${t}/${e}`}function QTe(n){let t=c.exec(n);return t?{instanceId:t[1],event:t[2],index:Number(t[3])}:null}
export{ZHs,_$t,e0s,QTe};
