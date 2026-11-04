// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{i}from"/$bunfs/root/chunk-jdmxbspc.js";import{P}from"/$bunfs/root/chunk-tkwtwx7k.js";import{homedir as r}from"os";import{join as o}from"path";function ZNo(){if(P()==="windows"&&i.APPDATA)return o(i.APPDATA,"gcloud");return o(r(),".config","gcloud")}function Q5n(){return i.CLOUDSDK_CONFIG||ZNo()}
export{ZNo,Q5n};
