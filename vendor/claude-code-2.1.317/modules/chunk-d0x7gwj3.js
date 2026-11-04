// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{mX,Q5,gse}from"./chunk-qntqpkb9.js";import"./chunk-7nwf9wwp.js";import{xe}from"./chunk-dbgyrqyp.js";var t=xe(mX()),o=xe(Q5()),r=xe(gse());class e extends t.OTLPExporterBase{constructor(p={}){super(r.createOtlpHttpExportDelegate(r.convertLegacyHttpOptions(p,"TRACES","v1/traces",{"Content-Type":"application/json"}),o.JsonTraceSerializer))}}export{e as OTLPTraceExporter};
