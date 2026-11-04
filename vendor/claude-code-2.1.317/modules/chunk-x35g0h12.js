// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{f}from"./chunk-hd335g9m.js";import{a}from"./chunk-sqwfq8wd.js";import{Fm}from"./chunk-e9ax2wbh.js";import{oIe}from"./chunk-amsa62md.js";function Hgt(){return Fm()||oIe()}function YMs(e){switch(e.kind){case"elsewhere":return"elsewhere";case"nowhere":return e.hasOwnSessionRecord?"here_only":"nowhere";case"unknown":return e.why==="not_looked"?"not_looked":"unknown"}}function GUn(e,o){a("tengu_remote_attach_record_lookup",{outcome:f(e),entry_point:f(o)})}
export{Hgt,YMs,GUn};
