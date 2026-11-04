// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{Re}from"./chunk-354zpx9e.js";import{A_r}from"./chunk-rfy3fddz.js";import{YK}from"./chunk-jcgevdes.js";import{ao}from"./chunk-fcydgh48.js";var Aro=ao();var Cro=ao();function nf(o){let t=Re().admissionText;if((o.judgedUnder??null)===t)return!0;let r=o.args.pluginStorageId;return YK(r)||o.args.sealed===!0&&Cro.get()?.(r)===!0||!A_r(r,Aro.get()?.()??null)}export{Aro,Cro,nf};
