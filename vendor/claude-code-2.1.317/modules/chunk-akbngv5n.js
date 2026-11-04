// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{p}from"./chunk-c3q80g49.js";import{Bd}from"./chunk-nj8ddyrh.js";import{v}from"./chunk-yx0yvz1d.js";import{cn,Lu}from"./chunk-fne52tw8.js";import{o,A,u}from"./chunk-e56bj9s5.js";var l=p(()=>A(u({marketplace:o(),plugin:o()})));function G$r(){let e=v("tengu_harbor_ledger",[]),n=l().safeParse(e);return n.success?n.data:[]}function LW(){return cn("allow_channels")&&v("tengu_harbor",!1)}function p1t(){if(!v("tengu_harbor",!1))return!0;let e=Lu("allow_channels");return e!==null&&e!=="cache_miss"&&e!=="route_missing"}function Vdn(e){if(!e)return!1;let{name:n,marketplace:r}=Bd(e);if(!r)return!1;return G$r().some((t)=>t.plugin===n&&t.marketplace===r)}
export{G$r,LW,p1t,Vdn};
