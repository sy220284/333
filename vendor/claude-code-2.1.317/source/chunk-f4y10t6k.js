// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{wn,v,sut,aT}from"/$bunfs/root/chunk-yx0yvz1d.js";import{Dx,h3e,cPn}from"/$bunfs/root/chunk-e9ax2wbh.js";var vHe="tengu_violin_willow";function czn(){try{let{value:e,source:o}=wn(vHe,!1);return aT(o)?e===!0:void 0}catch{return}}function eZe(){try{return v(vHe,!1)}catch{return!1}}function tZe(){return cPn()&&czn()===!0}function Fze({cloudClient:e}){if(h3e())return"tengu_violin_wood";return e&&czn()===!1?vHe:void 0}async function gAo({cloudClient:e}){try{return await Dx()&&(!e||await sut(vHe))}catch{return!1}}
export{vHe,czn,eZe,tZe,Fze,gAo};
