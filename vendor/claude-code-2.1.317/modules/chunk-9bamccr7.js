// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{P}from"./chunk-tkwtwx7k.js";import{ALt}from"./chunk-nj8ddyrh.js";import{constants as t}from"fs";function Dc(){return t.O_RDONLY|E4()}function E4(){if(P()==="windows")return 0;return t.O_NOFOLLOW|t.O_NONBLOCK}var ohi=["aarch64-apple-darwin","x86_64-apple-darwin","aarch64-unknown-linux-musl","x86_64-unknown-linux-musl"];function o(r,e){let n=e==="arm64"?"aarch64":e==="x64"?"x86_64":void 0;if(n===void 0)return;switch(r){case"macos":return`${n}-apple-darwin`;case"linux":case"wsl":return`${n}-unknown-linux-musl`;case"windows":case"unknown":return}}var d7r=268435456;function c7r(){return o(P(),"x64")}function DCt(r,e){if(r.endsWith(`-${e}`)){let n=r.slice(0,-(e.length+1));return ALt.test(n)?n:void 0}if(r.endsWith(`-${e}.exe`)){let n=r.slice(0,-(e.length+5));return ALt.test(n)?`${n}.exe`:void 0}return}
export{Dc,E4,ohi,d7r,c7r,DCt};
