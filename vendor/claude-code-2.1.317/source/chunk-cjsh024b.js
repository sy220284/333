// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{Re}from"/$bunfs/root/chunk-354zpx9e.js";import{Ykn}from"/$bunfs/root/chunk-1kjg2wmg.js";import{nh}from"/$bunfs/root/chunk-j23j3nbb.js";import{Kje}from"/$bunfs/root/chunk-nj8ddyrh.js";var vae=(o)=>o.name===Kje&&nh(o);var Gk=(o)=>{let t=o.startsWith("classic.")||o==="tool.describe"||o==="tool.call"||o==="tool.check";return Re().loadedModules.filter((e)=>!(t&&vae(e))&&!(o==="tool.check"&&e.name===Ykn&&nh(e)))};export{vae,Gk};
