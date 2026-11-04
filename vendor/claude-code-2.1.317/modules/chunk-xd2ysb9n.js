// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{b}from"./chunk-hd335g9m.js";import{N}from"./chunk-5x4vp4dg.js";import{l}from"./chunk-xkb87seb.js";import{fts,pts,mts}from"./chunk-2qhn9d21.js";function vRe(e,o){if(e!=="launched_from_home")return{};try{return{...fts(o)&&{only_refused_by:b("windows_profile_on_mount_without_drive")},...pts(o)&&{on_volume_mounted_twice:!0},...mts(o)&&{mount_source_unread:!0}}}catch(r){return l(N(r)),{}}}
export{vRe};
