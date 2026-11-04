// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{mX,Q5,gse}from"/$bunfs/root/chunk-qntqpkb9.js";import"/$bunfs/root/chunk-7nwf9wwp.js";import{xe}from"/$bunfs/root/chunk-dbgyrqyp.js";var t=xe(mX()),e=xe(Q5()),o=xe(gse());class r extends t.OTLPExporterBase{constructor(p={}){super(o.createOtlpHttpExportDelegate(o.convertLegacyHttpOptions(p,"LOGS","v1/logs",{"Content-Type":"application/x-protobuf"}),e.ProtobufLogsSerializer))}}export{r as OTLPLogExporter};
