// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{s1}from"/$bunfs/root/chunk-9x9nwakp.js";class vdn{append(e){this._buffer=this._buffer?Buffer.concat([this._buffer,e]):e}readMessage(){if(!this._buffer)return null;let e=this._buffer.indexOf(`
`);if(e===-1)return null;let r=this._buffer.toString("utf8",0,e).replace(/\r$/,"");return this._buffer=this._buffer.subarray(e+1),mMo(r)}clear(){this._buffer=void 0}}function mMo(e){return s1.parse(JSON.parse(e))}function dqn(e){return JSON.stringify(e)+`
`}
export{vdn,mMo,dqn};
