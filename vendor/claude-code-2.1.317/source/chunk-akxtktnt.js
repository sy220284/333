// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{p}from"/$bunfs/root/chunk-c3q80g49.js";import{o,E,O,u}from"/$bunfs/root/chunk-e56bj9s5.js";var c=p(()=>u({file_uuid:o(),file_name:o(),is_image:O().nullish(),sha256:o().nullish().catch(null),file_size:E().nullish().catch(void 0),project_folder_name:o().nullish().catch(void 0)})),s=256;function rI(e){if(typeof e!=="object"||e===null||!("file_attachments"in e))return[];let n=e.file_attachments;if(!Array.isArray(n))return[];let a=c();return n.slice(0,s).flatMap((r)=>{let t=a.safeParse(r);return t.success?[t.data]:[]})}var i=p(()=>u({shouldQuery:O().optional()}));function AAn(e){return i().safeParse(e).data?.shouldQuery}
export{rI,AAn};
