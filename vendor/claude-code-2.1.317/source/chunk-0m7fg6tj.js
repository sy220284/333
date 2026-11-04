// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{nn}from"/$bunfs/root/chunk-svppe5z4.js";import{_t}from"/$bunfs/root/chunk-xkb87seb.js";import{Rs}from"/$bunfs/root/chunk-9z9d97rw.js";import{lst}from"/$bunfs/root/chunk-ttn3wae7.js";function zZ(e){try{lst(nn().BASE_API_URL,e)}catch{return"egress_blocked"}if(Rs("zdr"))return"egress_blocked";return _t()?"essential_traffic":void 0}
export{zZ};
