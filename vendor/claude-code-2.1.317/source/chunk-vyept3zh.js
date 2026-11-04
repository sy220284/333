// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{DYn}from"/$bunfs/root/chunk-eqmcxq48.js";import{Q5,gse}from"/$bunfs/root/chunk-qntqpkb9.js";import"/$bunfs/root/chunk-7nwf9wwp.js";import{xe}from"/$bunfs/root/chunk-dbgyrqyp.js";var o=xe(DYn()),p=xe(Q5()),r=xe(gse());class t extends o.OTLPMetricExporterBase{constructor(e){super(r.createOtlpHttpExportDelegate(r.convertLegacyHttpOptions(e??{},"METRICS","v1/metrics",{"Content-Type":"application/x-protobuf"}),p.ProtobufMetricsSerializer),e)}}export{t as OTLPMetricExporter};
