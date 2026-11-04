// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{N}from"./chunk-5x4vp4dg.js";import{l}from"./chunk-xkb87seb.js";import{lle}from"./chunk-x0pb447t.js";import{bmr}from"./chunk-pm4z6241.js";import{Re}from"./chunk-354zpx9e.js";import{LJ}from"./chunk-7naxkzws.js";import{xvn}from"./chunk-szqagc10.js";import{nh}from"./chunk-j23j3nbb.js";function n(){try{return LJ()&&xvn()}catch(r){return l(N(r)),!0}}function SN(r){try{let o=Re(),e=o.hookRegistrationEpoch!==r.epoch||o.loadedModules!==r.modules;return r.wasUnknown||n()||e&&lle()&&xvn()}catch(o){return l(N(o)),!0}}function Oet({isRunReached:r}){try{return n()||Re().loadedModules.some((o)=>!nh(o)&&bmr(o.args.pluginStorageId)&&(o.hooks("prompt.submit")||!r&&o.hooks("command.run")))}catch(o){return l(N(o)),!0}}function UW(){let r=Re();return{wasUnknown:n(),epoch:r.hookRegistrationEpoch,modules:r.loadedModules}}
export{SN,Oet,UW};
