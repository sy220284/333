// @bun @bytecode
// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.317
import{v}from"./chunk-yx0yvz1d.js";import{TB}from"./chunk-bjevk2dr.js";import{ri}from"./chunk-p0fqg352.js";var t="<routine_summary>";function uit(){return v("tengu_kairos_push_notifications",!1)}function ylr(){return v("tengu_kairos_input_needed_push",!1)}function $Fe(){return uit()&&ri("agentPushNotifEnabled",!1).value}var ugi="Send a notification to the user via their terminal and, when Remote Control is connected, also push to their mobile device",e=`This tool sends a desktop notification in the user's terminal. If Remote Control is connected, it also pushes to their phone. Either way, it pulls their attention from whatever they're doing \u2014 a meeting, another task, dinner \u2014 to this session. That's the cost. The benefit is they learn something now that they'd want to know now: a long task finished while they were away, a build is ready, you've hit something that needs their decision before you can continue.

Because a notification they didn't need is annoying in a way that accumulates, err toward not sending one. Don't notify for routine progress, or to announce you've answered something they asked seconds ago and are clearly still watching, or when a quick task completes. Notify when there's a real chance they've walked away and there's something worth coming back for \u2014 or when they've explicitly asked you to notify them.

Keep the message under 200 characters, one line, no markdown. Lead with what they'd act on \u2014 "build failed: 2 auth tests" tells them more than "task done" and more than a status dump.

When the user is actively at the terminal, your output already reaches them \u2014 a notification on top of it would be a duplicate, so the tool skips it and says so. A "not sent" result is expected and only ever about this one notification: it was redundant, turned off, or had nowhere to go.`,o=`

This is a scheduled routine \u2014 the notification is how the run reaches its owner. Wrap the message in ${t} tags: the first sentence becomes the phone banner, the full text becomes the email body.`;function fgi(){return TB()?e+o:e}
export{uit,ylr,$Fe,ugi,fgi};
