// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{mX,Q5,gse}from"./chunk-qntqpkb9.js";import"./chunk-7nwf9wwp.js";import{xe}from"./chunk-dbgyrqyp.js";var t=xe(mX()),e=xe(Q5()),o=xe(gse());class r extends t.OTLPExporterBase{constructor(p={}){super(o.createOtlpHttpExportDelegate(o.convertLegacyHttpOptions(p,"LOGS","v1/logs",{"Content-Type":"application/json"}),e.JsonLogsSerializer))}}export{r as OTLPLogExporter};
