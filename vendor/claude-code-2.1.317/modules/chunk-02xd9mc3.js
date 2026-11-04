// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{kY}from"./chunk-yx0yvz1d.js";import{p}from"./chunk-c3q80g49.js";import{UJ}from"./chunk-zx1zkewe.js";import{E,u}from"./chunk-e56bj9s5.js";var o=60000,r=1800000,t=2592000000,i=p(()=>u({recurringFrac:E().min(0).max(1),recurringCapMs:E().int().min(0).max(r),oneShotMaxMs:E().int().min(0).max(r),oneShotFloorMs:E().int().min(0).max(r),oneShotMinuteMod:E().int().min(1).max(60),recurringMaxAgeMs:E().int().min(0).max(t).default(UJ.recurringMaxAgeMs),cacheLeadMs:E().int().min(0).max(60000).default(UJ.cacheLeadMs)}).refine((n)=>n.oneShotFloorMs<=n.oneShotMaxMs));function sX(){let n=kY("tengu_kairos_cron_config",UJ,o),e=i().safeParse(n);return e.success?e.data:UJ}
export{sX};
