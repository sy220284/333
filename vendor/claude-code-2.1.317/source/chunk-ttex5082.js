// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{q}from"/$bunfs/root/chunk-wxyh2ndv.js";import{Is}from"/$bunfs/root/chunk-xr1mz8xv.js";import{gf}from"/$bunfs/root/chunk-z227w65w.js";import{B6t}from"/$bunfs/root/chunk-amknwp4v.js";import{sep as i}from"path";function TTt(t){if(q())return null;let e=`${B6t()}${i}`,n=".output";if(t.startsWith(e)&&t.endsWith(n)){let r=t.slice(e.length,-n.length);if(r.length>0&&r.length<=20&&/^[a-zA-Z0-9_-]+$/.test(r))return r}return null}function oii(t){if(t?.file_path?.startsWith(gf()))return"Reading Plan";if(t?.file_path&&TTt(t.file_path))return"Read agent output";return"Read"}function h6o(t){if(!t?.file_path)return null;let e=TTt(t.file_path);if(e)return e;return Is(t.file_path)}
export{TTt,oii,h6o};
