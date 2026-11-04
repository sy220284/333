// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{U}from"/$bunfs/root/chunk-wxyh2ndv.js";import{f}from"/$bunfs/root/chunk-hd335g9m.js";import{W}from"/$bunfs/root/chunk-agahg8zh.js";import{a}from"/$bunfs/root/chunk-sqwfq8wd.js";import{Sd}from"/$bunfs/root/chunk-ftd6jk9c.js";import{Cv}from"/$bunfs/root/chunk-yx0yvz1d.js";import{readFile as s}from"fs/promises";class o{firedSites=new Set;fire(e){if(this.firedSites.has(e))return;this.firedSites.add(e),a("tengu_dead_probe_adopt_ticks_token",{site:f(e)})}reset(){this.firedSites.clear()}}var l=new W(()=>new o);function u(){return l.of(U().host)}function Fko(e){u().fire(e)}async function nin(e){try{let t=await s(`/proc/${e}/stat`,"utf-8"),r=t.lastIndexOf(")"),n=t.slice(r+2).split(" "),i=Number(n[19]);return Number.isFinite(i)?i:null}catch{return null}}async function yyt(e,t,r){if(r!==void 0){if(await Sd(e,{skipCache:!0})!==r)return}else if(t!==void 0){if(Fko("kill_gate"),await nin(e)!==t)return}else return;await Cv(e,"SIGTERM",{groupMembersByPidToo:!0}).catch(()=>{})}
export{Fko,nin,yyt};
