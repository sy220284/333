// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{lstat as s}from"fs/promises";async function zC(i,e,t){if(i.isDirectory())return"dir";if(i.isSymbolicLink())return"symlink";if(i.isFile())return"file";if(i.isFIFO()||i.isSocket()||i.isBlockDevice()||i.isCharacterDevice())return"other";try{let r=await s(e);return r.isDirectory()?"dir":r.isSymbolicLink()?"symlink":r.isFile()?"file":"other"}catch{return t}}
export{zC};
