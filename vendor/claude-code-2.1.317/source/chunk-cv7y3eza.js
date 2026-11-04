// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{f}from"/$bunfs/root/chunk-hd335g9m.js";import{i}from"/$bunfs/root/chunk-jdmxbspc.js";import{Dye,jV}from"/$bunfs/root/chunk-bjevk2dr.js";import{Te}from"/$bunfs/root/chunk-74x0zd10.js";import{a}from"/$bunfs/root/chunk-sqwfq8wd.js";import{Kn,hM}from"/$bunfs/root/chunk-mf6cjfte.js";import{v}from"/$bunfs/root/chunk-yx0yvz1d.js";import{Wae}from"/$bunfs/root/chunk-mf7m6f6w.js";import{X}from"/$bunfs/root/chunk-xv54wykd.js";function wun(){return hM("feedbackDrafts")[0]??"notify"}function O0o(){if(Wae()!==null)return!1;if(Dye())return!1;if(jV())return!1;if(Te()!=="firstParty")return!1;let e=i.CLAUDE_CODE_SEND_FEEDBACK;if(e===!1)return!1;if(e===!0)return v("tengu_juniper_relay",!1);return v("tengu_juniper_relay",!1)}function e6(){return wun()!=="off"&&O0o()}function XYn(e,{storageV5:t,via:r}){let n=X()&&t!==void 0?Kn("userSettings",{feedbackDrafts:e},void 0,t):Kn("userSettings",{feedbackDrafts:e});return a("tengu_feedback_drafts_setting_changed",{value:f(e),via:f(r)}),n}
export{wun,O0o,e6,XYn};
